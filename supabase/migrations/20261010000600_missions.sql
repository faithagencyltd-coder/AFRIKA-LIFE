-- =============================================================================
-- Phase A3 — Missions (CdC V1 §33) et objectifs personnels (CdC V2 §50, §61).
--   La progression est CALCULÉE à partir des données existantes (journal des
--   actions, grand livre, emplois, logements) : aucune triche possible en
--   « déclarant » une mission faite. La récompense n'est versée qu'une fois.
-- =============================================================================

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('rent_paid', 'rent_missed', 'eviction', 'home', 'mission'));

create table public.missions (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  chapter text not null default 'nouvelle_vie',
  title text not null,
  description text not null default '',
  icon text not null default '🎯',
  objective_type text not null,
  target bigint not null check (target > 0),
  reward_cash bigint not null default 0 check (reward_cash >= 0),
  reward_xp integer not null default 0 check (reward_xp >= 0),
  -- Mission à terminer avant celle-ci (parcours guidé).
  requires text references public.missions (code),
  sort integer not null default 0
);

create table public.character_missions (
  character_id uuid not null references public.characters (id) on delete cascade,
  mission_code text not null references public.missions (code),
  claimed_at timestamptz not null default now(),
  primary key (character_id, mission_code)
);

-- Objectifs que le joueur se fixe lui-même (« Voici la vie que je veux construire »).
create table public.goals (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  title text not null,
  icon text not null,
  objective_type text not null,
  target bigint not null check (target > 0),
  sort integer not null default 0
);

create table public.character_goals (
  character_id uuid not null references public.characters (id) on delete cascade,
  goal_code text not null references public.goals (code),
  chosen_at timestamptz not null default now(),
  primary key (character_id, goal_code)
);

do $$
declare t text;
begin
  foreach t in array array['missions', 'goals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_lecture', t);
  end loop;
  foreach t in array array['character_missions', 'character_goals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (character_id in (select id from public.characters where user_id = (select auth.uid())))',
      t || '_proprietaire', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Évaluation des objectifs
-- -----------------------------------------------------------------------------

-- Activités « de sortie » qui comptent pour les missions de loisirs.
create function public.outing_codes() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['cine_film', 'plage_balade', 'lounge_soiree', 'bon_coin_causer', 'marche_fleaner', 'sport_seance', 'maquis_tantie_causer', 'baobab_diner'];
$$;

-- Progression d'un objectif, calculée depuis les données du serveur.
create function public._objective_progress(p_character uuid, p_type text) returns bigint
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v bigint;
begin
  case p_type
    when 'meals' then
      select count(*) into v from activity_log l
      where l.character_id = p_character and l.kind = 'activity' and (
        exists (select 1 from activities a where a.code = l.code and coalesce((a.effects ->> 'hunger')::numeric, 0) >= 20)
        or exists (select 1 from home_activities h where h.code = l.code and coalesce((h.effects ->> 'hunger')::numeric, 0) >= 20)
        or exists (select 1 from items i where i.code = l.code and i.category = 'nourriture' and coalesce((i.effects ->> 'hunger')::numeric, 0) >= 15));
    when 'job' then
      select count(*) into v from character_jobs where character_id = p_character;
    when 'shifts' then
      select coalesce(sum(shifts), 0) into v from character_jobs where character_id = p_character;
    when 'work_days' then
      select count(distinct game_minute(ended_at) / 1440) into v from activity_log where character_id = p_character and kind = 'work';
    when 'home' then
      select count(*) into v from character_homes where character_id = p_character;
    when 'own_home' then
      select count(*) into v from character_homes where character_id = p_character and tenure = 'owned';
    when 'purchases' then
      select count(*) into v from transactions where character_id = p_character and kind = 'purchase';
    when 'outings' then
      select count(*) into v from activity_log where character_id = p_character and code = any (outing_codes());
    when 'districts' then
      select count(distinct district_code) into v from activity_log where character_id = p_character;
    when 'cash' then
      select cash into v from characters where id = p_character;
    when 'level' then
      select player_level(xp) into v from characters where id = p_character;
    when 'job_level' then
      select coalesce(max(job_level(xp)), 0) into v from character_jobs where character_id = p_character;
    else
      v := 0;
  end case;
  return coalesce(v, 0);
end $$;

-- -----------------------------------------------------------------------------
-- Fonctions publiques
-- -----------------------------------------------------------------------------

-- Toucher la récompense d'une mission accomplie (une seule fois, dans l'ordre du parcours).
create function public.claim_mission(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  m missions;
  v_progress bigint;
begin
  perform _settle(v_id);
  select * into m from missions where code = p_code;
  if not found then
    perform _fail('unknown_mission', 'Cette mission n''existe pas.');
  end if;
  if exists (select 1 from character_missions where character_id = v_id and mission_code = m.code) then
    perform _fail('already_claimed', 'Récompense déjà reçue.');
  end if;
  if m.requires is not null and not exists (select 1 from character_missions where character_id = v_id and mission_code = m.requires) then
    perform _fail('mission_locked', 'Terminez d''abord la mission précédente.');
  end if;
  v_progress := _objective_progress(v_id, m.objective_type);
  if v_progress < m.target then
    perform _fail('mission_incomplete', format('Mission pas encore accomplie (%s / %s).', least(v_progress, m.target), m.target));
  end if;
  insert into character_missions (character_id, mission_code) values (v_id, m.code);
  perform _money(v_id, m.reward_cash, 'mission', m.code);
  update characters set xp = xp + m.reward_xp where id = v_id;
  perform _notify(v_id, 'mission', format('Mission accomplie : %s. +%s FCFA, +%s XP.', m.title, _fcfa(m.reward_cash), m.reward_xp));
  return _state(v_id);
end $$;

-- Choisir un objectif personnel (3 au plus en même temps).
create function public.choose_goal(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := _lock_my_character();
begin
  if not exists (select 1 from goals where code = p_code) then
    perform _fail('unknown_goal', 'Cet objectif n''existe pas.');
  end if;
  if exists (select 1 from character_goals where character_id = v_id and goal_code = p_code) then
    perform _fail('already_chosen', 'Objectif déjà choisi.');
  end if;
  if (select count(*) from character_goals where character_id = v_id) >= 3 then
    perform _fail('too_many_goals', 'Trois objectifs au maximum : abandonnez-en un d''abord.');
  end if;
  insert into character_goals (character_id, goal_code) values (v_id, p_code);
  return _state(v_id);
end $$;

create function public.drop_goal(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := _lock_my_character();
begin
  delete from character_goals where character_id = v_id and goal_code = p_code;
  if not found then
    perform _fail('unknown_goal', 'Cet objectif ne fait pas partie des vôtres.');
  end if;
  return _state(v_id);
end $$;

-- État des modules : inventaire + missions + objectifs.
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
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Données : parcours « Nouvelle vie » et objectifs
-- -----------------------------------------------------------------------------

insert into public.missions (code, title, description, icon, objective_type, target, reward_cash, reward_xp, requires, sort) values
  ('premier_repas', 'Prends des forces', 'Mange un vrai repas : maquis, marché ou ton sac.', '🍲', 'meals', 1, 2000, 10, null, 1),
  ('trouver_travail', 'Trouve un travail', 'Postule sur place dans un lieu qui recrute.', '💼', 'job', 1, 10000, 20, 'premier_repas', 2),
  ('premier_salaire', 'Ton premier salaire', 'Fais un service complet de travail.', '💵', 'shifts', 1, 5000, 10, 'trouver_travail', 3),
  ('faire_courses', 'Fais tes courses', 'Achète un article dans un marché ou une boutique.', '🛒', 'purchases', 1, 3000, 10, 'premier_salaire', 4),
  ('un_toit', 'Un toit à toi', 'Loue un logement à l''agence immobilière de Ganhi.', '🏠', 'home', 1, 15000, 30, 'faire_courses', 5),
  ('explorer', 'Découvre Cotonou', 'Fais quelque chose dans 4 quartiers différents.', '🗺️', 'districts', 4, 8000, 20, 'un_toit', 6),
  ('cinq_jours', 'Travaille 5 jours', 'Travaille pendant 5 jours de jeu différents.', '📅', 'work_days', 5, 25000, 50, 'explorer', 7),
  ('sortir', 'Profite de la vie', 'Fais 3 sorties : cinéma, plage, lounge, maquis…', '🎉', 'outings', 3, 10000, 20, 'cinq_jours', 8),
  ('monter_grade', 'Monte en grade', 'Atteins le niveau 2 dans un métier.', '📈', 'job_level', 2, 20000, 40, 'sortir', 9),
  ('niveau_3', 'Une vie qui décolle', 'Atteins le niveau 3.', '⭐', 'level', 3, 50000, 0, 'monter_grade', 10),
  ('proprietaire', 'Propriétaire', 'Achète ton premier logement.', '🔑', 'own_home', 1, 250000, 100, 'niveau_3', 11);

insert into public.goals (code, title, icon, objective_type, target, sort) values
  ('million', 'Avoir 1 000 000 FCFA', '💰', 'cash', 1000000, 1),
  ('dix_millions', 'Avoir 10 000 000 FCFA', '🤑', 'cash', 10000000, 2),
  ('maison', 'Posséder sa maison', '🏠', 'own_home', 1, 3),
  ('expert', 'Niveau 5 dans un métier', '🏆', 'job_level', 5, 4),
  ('niveau_10', 'Atteindre le niveau 10', '⭐', 'level', 10, 5),
  ('explorateur', 'Vivre dans les 8 quartiers de Cotonou', '🧭', 'districts', 8, 6),
  ('bosseur', '100 services de travail', '💪', 'shifts', 100, 7),
  ('gourmet', '50 bons repas', '🍲', 'meals', 50, 8),
  ('fetard', '30 sorties', '🎶', 'outings', 30, 9);

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
  public.outing_codes()
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
  public.drop_goal(text)
to authenticated;
