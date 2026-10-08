-- =============================================================================
-- Phase A5 — Compétences (CdC V2 §7) et réputation (§8).
--   Les compétences augmentent avec l'usage : chaque service de travail et
--   certaines activités rapportent des points (colonne `gains`). La réputation
--   a trois volets : professionnelle, sociale, commerciale.
--   Les formations (phase C) s'appuieront sur ces compétences.
-- =============================================================================

create table public.skills (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  icon text not null,
  description text not null default '',
  sort integer not null default 0
);
alter table public.skills enable row level security;
revoke all on public.skills from anon, authenticated;
grant select on public.skills to anon, authenticated;
create policy skills_lecture on public.skills for select to anon, authenticated using (true);

create table public.character_skills (
  character_id uuid not null references public.characters (id) on delete cascade,
  skill_code text not null references public.skills (code),
  xp integer not null default 0 check (xp >= 0),
  primary key (character_id, skill_code)
);
alter table public.character_skills enable row level security;
revoke all on public.character_skills from anon, authenticated;
grant select on public.character_skills to authenticated;
create policy character_skills_proprietaire on public.character_skills for select to authenticated
  using (character_id in (select id from public.characters where user_id = (select auth.uid())));

alter table public.characters
  add column rep_pro integer not null default 0 check (rep_pro >= 0),
  add column rep_social integer not null default 0 check (rep_social >= 0),
  add column rep_commercial integer not null default 0 check (rep_commercial >= 0);

-- Gains : {"skills": {"commerce": 3}, "rep": {"pro": 2, "commercial": 1}}
create function public._valid_gains(p jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in ('skills', 'rep'))
    and (p -> 'rep' is null or not exists (
      select 1 from jsonb_each(p -> 'rep') e where e.key not in ('pro', 'social', 'commercial') or jsonb_typeof(e.value) <> 'number'))
    and (p -> 'skills' is null or not exists (
      select 1 from jsonb_each(p -> 'skills') e where jsonb_typeof(e.value) <> 'number'));
$$;

alter table public.jobs add column gains jsonb not null default '{}' check (_valid_gains(gains));
alter table public.activities add column gains jsonb not null default '{}' check (_valid_gains(gains));
alter table public.home_activities add column gains jsonb not null default '{}' check (_valid_gains(gains));

-- Niveau d'une compétence (1 à 10) : 25 XP pour le niveau 2, 75 pour le 3, 150 pour le 4…
create function public.skill_level(p_xp integer) returns integer
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select least(10, floor((1 + sqrt(1 + 8 * greatest(p_xp, 0) / 25.0)) / 2))::integer;
$$;

-- Applique les gains d'une action terminée.
create function public._apply_gains(p_character uuid, p_gains jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g record;
begin
  if p_gains is null or p_gains = '{}'::jsonb then
    return;
  end if;
  for g in select e.key, (e.value #>> '{}')::integer as pts from jsonb_each(coalesce(p_gains -> 'skills', '{}')) e
           where exists (select 1 from skills s where s.code = e.key) loop
    insert into character_skills (character_id, skill_code, xp) values (p_character, g.key, greatest(g.pts, 0))
    on conflict (character_id, skill_code) do update set xp = character_skills.xp + greatest(excluded.xp, 0);
  end loop;
  update characters set
    rep_pro = least(1000, rep_pro + coalesce((p_gains -> 'rep' ->> 'pro')::integer, 0)),
    rep_social = least(1000, rep_social + coalesce((p_gains -> 'rep' ->> 'social')::integer, 0)),
    rep_commercial = least(1000, rep_commercial + coalesce((p_gains -> 'rep' ->> 'commercial')::integer, 0))
  where id = p_character;
end $$;

-- Fin d'action (version 2) : la version d'origine, puis les gains de compétences et de réputation.
alter function public._complete_activity(uuid) rename to _complete_activity_core;
create function public._complete_activity(p_character uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a jsonb;
begin
  select activity into a from characters where id = p_character;
  perform _complete_activity_core(p_character);
  if a is null then
    return;
  end if;
  perform _apply_gains(p_character, case a ->> 'kind'
    when 'work' then (select gains from jobs where code = a ->> 'code')
    when 'activity' then coalesce(
      (select gains from activities where code = a ->> 'code'),
      (select gains from home_activities where code = a ->> 'code'))
    else null end);
end $$;

-- État des modules (version 3) : + compétences et réputation.
create or replace function public._state_modules(p_character uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'inventory', coalesce((
      select jsonb_agg(jsonb_build_object('code', i.item_code, 'quantity', i.quantity) order by it.sort)
      from inventory i join items it on it.code = i.item_code
      where i.character_id = p_character
    ), '[]'::jsonb),
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', m.code,
        'progress', least(_objective_progress(p_character, m.objective_type), m.target),
        'status', case
          when cm.mission_code is not null then 'claimed'
          when m.requires is not null and not exists (
            select 1 from character_missions r where r.character_id = p_character and r.mission_code = m.requires) then 'locked'
          when _objective_progress(p_character, m.objective_type) >= m.target then 'ready'
          else 'active' end
      ) order by m.sort)
      from missions m
      left join character_missions cm on cm.character_id = p_character and cm.mission_code = m.code
    ), '[]'::jsonb),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', g.code,
        'progress', least(_objective_progress(p_character, g.objective_type), g.target)
      ) order by cg.chosen_at)
      from character_goals cg join goals g on g.code = cg.goal_code
      where cg.character_id = p_character
    ), '[]'::jsonb),
    'sanction', (
      select jsonb_build_object('kind', sanction, 'until', sanction_until, 'reason', sanction_reason)
      from characters
      where id = p_character and (sanction = 'banni' or (sanction = 'suspendu' and (sanction_until is null or sanction_until > now())))
    ),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('code', cs.skill_code, 'xp', cs.xp, 'level', skill_level(cs.xp)) order by s.sort)
      from character_skills cs join skills s on s.code = cs.skill_code
      where cs.character_id = p_character
    ), '[]'::jsonb),
    'reputation', (
      select jsonb_build_object('pro', rep_pro, 'social', rep_social, 'commercial', rep_commercial)
      from characters where id = p_character
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- Données
-- -----------------------------------------------------------------------------

insert into public.skills (code, name, icon, description, sort) values
  ('communication', 'Communication', '🗣️', 'Parler, convaincre, servir les clients.', 1),
  ('informatique', 'Informatique', '💻', 'Ordinateurs, logiciels, numérique.', 2),
  ('construction', 'Construction', '🧱', 'Maçonnerie, électricité, chantiers.', 3),
  ('commerce', 'Commerce', '🛍️', 'Vendre, négocier, tenir une caisse.', 4),
  ('cuisine', 'Cuisine', '🍳', 'Préparer de bons plats.', 5),
  ('mecanique', 'Mécanique', '🔧', 'Motos, voitures, moteurs.', 6),
  ('gestion', 'Gestion', '📊', 'Organisation, comptes, dossiers.', 7),
  ('leadership', 'Leadership', '🧭', 'Diriger, motiver, décider.', 8),
  ('creativite', 'Créativité', '🎨', 'Idées, design, culture.', 9);

update public.jobs set gains = v.gains::jsonb from (values
  ('vendeur_marche', '{"skills": {"commerce": 3, "communication": 2}, "rep": {"pro": 2, "commercial": 1}}'),
  ('serveur', '{"skills": {"communication": 3, "cuisine": 1}, "rep": {"pro": 2, "social": 1}}'),
  ('agent_securite', '{"skills": {"leadership": 2, "communication": 1}, "rep": {"pro": 2}}'),
  ('caissier', '{"skills": {"commerce": 2, "gestion": 2}, "rep": {"pro": 2, "commercial": 1}}'),
  ('livreur', '{"skills": {"mecanique": 1, "gestion": 1, "communication": 1}, "rep": {"pro": 2}}'),
  ('macon', '{"skills": {"construction": 4}, "rep": {"pro": 2}}'),
  ('mecanicien', '{"skills": {"mecanique": 4}, "rep": {"pro": 2}}'),
  ('chauffeur_taxi', '{"skills": {"communication": 2, "mecanique": 1}, "rep": {"pro": 2, "social": 1}}'),
  ('assistant_bureau', '{"skills": {"informatique": 2, "gestion": 3}, "rep": {"pro": 2}}'),
  ('electricien', '{"skills": {"construction": 3, "informatique": 1}, "rep": {"pro": 2}}')
) v(code, gains) where jobs.code = v.code;

update public.activities set gains = v.gains::jsonb from (values
  ('appeler_famille', '{"skills": {"communication": 1}, "rep": {"social": 1}}'),
  ('maquis_tantie_causer', '{"skills": {"communication": 1}, "rep": {"social": 1}}'),
  ('bon_coin_causer', '{"skills": {"communication": 1}, "rep": {"social": 1}}'),
  ('lounge_soiree', '{"skills": {"communication": 2, "leadership": 1}, "rep": {"social": 2}}'),
  ('plage_balade', '{"rep": {"social": 1}}'),
  ('marche_fleaner', '{"skills": {"commerce": 1}}'),
  ('cine_film', '{"skills": {"creativite": 1}}'),
  ('regarder_videos', '{"skills": {"creativite": 1}}'),
  ('sport_seance', '{"skills": {"leadership": 1}}')
) v(code, gains) where activities.code = v.code;

update public.home_activities set gains = v.gains::jsonb from (values
  ('maison_cuisiner', '{"skills": {"cuisine": 3}}'),
  ('maison_recevoir', '{"skills": {"communication": 2, "leadership": 1}, "rep": {"social": 3}}'),
  ('maison_jeux_video', '{"skills": {"informatique": 1}}')
) v(code, gains) where home_activities.code = v.code;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.need_keys(),
  public.game_minute(timestamptz),
  public.real_duration(numeric),
  public.building_is_open(integer, integer, bigint),
  public.player_level(bigint),
  public.job_level(integer),
  public.job_pay(bigint, integer),
  public.travel_quotes(text),
  public.rent_period(),
  public.outing_codes(),
  public.skill_level(integer)
to anon, authenticated;

grant execute on function
  public.create_character(text, text, text, integer, text, jsonb),
  public.game_state(),
  public.start_activity(text),
  public.travel_to(text, text),
  public.apply_for_job(text),
  public.quit_job(),
  public.start_work(),
  public.rent_home(text),
  public.buy_home(text),
  public.leave_home(),
  public.pay_home_arrears(),
  public.start_home_activity(text),
  public.mark_notifications_read(),
  public.buy_item(text, text, integer),
  public.use_item(text),
  public.change_look(text, text),
  public.claim_mission(text),
  public.choose_goal(text),
  public.drop_goal(text),
  public.admin_role(),
  public.admin_economy(),
  public.admin_players(text),
  public.admin_sanction(uuid, text, integer, text),
  public.admin_adjust_cash(uuid, bigint, text),
  public.admin_prices(),
  public.admin_set_price(text, text, bigint),
  public.admin_audit_log()
to authenticated;
