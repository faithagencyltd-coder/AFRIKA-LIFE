-- =============================================================================
-- Étapes 3 à 8 — Moteur de jeu (seul point d'écriture des données de joueurs).
--   Fonctions publiques (rpc) : create_character, game_state, start_activity,
--   travel_quotes, travel_to, apply_for_job, quit_job, start_work.
--   Fonctions internes (préfixe _) : non appelables depuis l'API.
-- Voir docs/ARCHITECTURE.md §6 (règles chiffrées) et §7 (cycle d'une action).
-- =============================================================================

-- Erreur de jeu : message en français pour le joueur, code machine dans HINT.
create function public._fail(p_code text, p_message text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception using message = p_message, hint = p_code, errcode = 'P0001';
end $$;

-- 12500 → « 12 500 »
create function public._fcfa(p_amount bigint) returns text
language sql immutable set search_path = public, pg_temp as $$
  select regexp_replace(p_amount::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g');
$$;

-- Accord simple selon le sexe du personnage : _g('homme', 'fatigué', 'fatiguée').
create function public._g(p_gender text, p_masc text, p_fem text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_gender = 'femme' then p_fem else p_masc end;
$$;

-- Personnage du joueur connecté, verrouillé jusqu'à la fin de la transaction.
create function public._lock_my_character() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    perform _fail('not_authenticated', 'Connectez-vous pour jouer.');
  end if;
  select id into v_id from characters where user_id = auth.uid() for update;
  if v_id is null then
    perform _fail('no_character', 'Créez d''abord votre personnage.');
  end if;
  return v_id;
end $$;

-- Seul point de modification de l'argent : vérifie le solde et écrit le grand livre.
create function public._money(p_character uuid, p_amount bigint, p_kind text, p_ref text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cash bigint;
begin
  select cash into v_cash from characters where id = p_character for update;
  if p_amount = 0 then
    return v_cash;
  end if;
  if v_cash + p_amount < 0 then
    perform _fail('insufficient_funds', format('Pas assez d''argent : il vous manque %s FCFA.', _fcfa(-(v_cash + p_amount))));
  end if;
  update characters set cash = cash + p_amount where id = p_character returning cash into v_cash;
  insert into transactions (character_id, amount, balance_after, kind, ref) values (p_character, p_amount, v_cash, p_kind, p_ref);
  return v_cash;
end $$;

-- Baisse des besoins entre needs_updated_at et p_to. p_capped : absence plafonnée (D-03).
create function public._decay(p_character uuid, p_to timestamptz, p_capped boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg game_config;
  v_from timestamptz;
  v_seconds double precision;
  h double precision;
  d jsonb;
begin
  select * into cfg from game_config;
  select needs_updated_at into v_from from characters where id = p_character;
  if p_to <= v_from then
    return;
  end if;
  v_seconds := extract(epoch from (p_to - v_from));
  if p_capped then
    v_seconds := least(v_seconds, cfg.idle_cap_minutes * 60.0);
  end if;
  h := v_seconds * cfg.time_scale / 3600.0;  -- heures de jeu écoulées
  d := cfg.need_decay;
  update characters set
    hunger = greatest(0, hunger - coalesce((d ->> 'hunger')::float8, 0) * h),
    energy = greatest(0, energy - coalesce((d ->> 'energy')::float8, 0) * h),
    hygiene = greatest(0, hygiene - coalesce((d ->> 'hygiene')::float8, 0) * h),
    fun = greatest(0, fun - coalesce((d ->> 'fun')::float8, 0) * h),
    social = greatest(0, social - coalesce((d ->> 'social')::float8, 0) * h),
    bladder = greatest(0, bladder - coalesce((d ->> 'bladder')::float8, 0) * h),
    needs_updated_at = p_to
  where id = p_character;
end $$;

-- Ajoute des effets aux besoins (bornés entre 0 et 100).
create function public._apply_needs(p_character uuid, p_effects jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_effects is null or p_effects = '{}'::jsonb then
    return;
  end if;
  update characters set
    hunger = least(100, greatest(0, hunger + coalesce((p_effects ->> 'hunger')::float8, 0))),
    energy = least(100, greatest(0, energy + coalesce((p_effects ->> 'energy')::float8, 0))),
    hygiene = least(100, greatest(0, hygiene + coalesce((p_effects ->> 'hygiene')::float8, 0))),
    fun = least(100, greatest(0, fun + coalesce((p_effects ->> 'fun')::float8, 0))),
    social = least(100, greatest(0, social + coalesce((p_effects ->> 'social')::float8, 0))),
    bladder = least(100, greatest(0, bladder + coalesce((p_effects ->> 'bladder')::float8, 0)))
  where id = p_character;
end $$;

-- Termine l'action en cours : effets, gain, XP, destination, journal.
create function public._complete_activity(p_character uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c characters;
  a jsonb;
  v_earn bigint;
begin
  select * into c from characters where id = p_character;
  a := c.activity;
  if a is null then
    return;
  end if;
  perform _apply_needs(p_character, a -> 'effects');
  update characters set
    xp = xp + coalesce((a ->> 'xp')::integer, 0),
    district_code = coalesce(a ->> 'to_district', district_code),
    activity = null, activity_started_at = null, activity_ends_at = null
  where id = p_character;
  v_earn := coalesce((a ->> 'earn')::bigint, 0);
  if v_earn > 0 then
    perform _money(p_character, v_earn, 'salary', a ->> 'code');
  end if;
  if a ->> 'kind' = 'work' then
    update character_jobs set xp = xp + coalesce((a ->> 'job_xp')::integer, 0), shifts = shifts + 1
    where character_id = p_character and job_code = a ->> 'code';
  end if;
  insert into activity_log (character_id, kind, code, label, district_code, cost, earned, xp, started_at, ended_at)
  values (p_character, a ->> 'kind', a ->> 'code', a ->> 'label', c.district_code,
          coalesce((a ->> 'cost')::bigint, 0), v_earn, coalesce((a ->> 'xp')::integer, 0),
          c.activity_started_at, c.activity_ends_at);
end $$;

-- Met le personnage à jour jusqu'à maintenant (évaluation paresseuse, P2).
create function public._settle(p_character uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c characters;
begin
  select * into c from characters where id = p_character for update;
  if c.activity is not null then
    if c.activity_ends_at > now() then
      -- Action en cours : le temps compte entièrement.
      perform _decay(p_character, now(), false);
      return;
    end if;
    perform _decay(p_character, c.activity_ends_at, false);
    perform _complete_activity(p_character);
  end if;
  perform _decay(p_character, now(), true);
end $$;

-- Échoue si le personnage est occupé.
create function public._ensure_free(p_character uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_label text;
begin
  select activity ->> 'label' into v_label from characters where id = p_character and activity is not null;
  if v_label is not null then
    perform _fail('busy', format('Action en cours : %s. Attendez qu''elle se termine.', v_label));
  end if;
end $$;

-- État complet du personnage pour l'interface (sans recalcul).
create function public._state(p_character uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'clock', jsonb_build_object(
      'server_now', now(),
      'world_epoch', g.world_epoch,
      'time_scale', g.time_scale,
      'start_game_minute', g.start_game_minute,
      'game_minute', game_minute(now())
    ),
    'character', jsonb_build_object(
      'id', c.id,
      'first_name', c.first_name,
      'pseudo', c.pseudo,
      'gender', c.gender,
      'age', c.age,
      'appearance', c.appearance,
      'country_code', c.country_code,
      'city_code', c.city_code,
      'district_code', c.district_code,
      'cash', c.cash,
      'xp', c.xp,
      'level', player_level(c.xp),
      'next_level_xp', 100 * (player_level(c.xp) + 1) * player_level(c.xp) / 2,
      'needs', jsonb_build_object(
        'hunger', round(c.hunger::numeric, 1),
        'energy', round(c.energy::numeric, 1),
        'hygiene', round(c.hygiene::numeric, 1),
        'fun', round(c.fun::numeric, 1),
        'social', round(c.social::numeric, 1),
        'bladder', round(c.bladder::numeric, 1)
      ),
      'activity', case when c.activity is null then null
        else c.activity || jsonb_build_object('started_at', c.activity_started_at, 'ends_at', c.activity_ends_at) end
    ),
    'job', (
      select jsonb_build_object(
        'code', j.code,
        'name', _g(c.gender, j.name, coalesce(j.name_feminine, j.name)),
        'building_code', j.building_code,
        'district_code', b.district_code,
        'level', job_level(cj.xp),
        'max_level', cardinality(g.job_level_xp),
        'xp', cj.xp,
        'next_level_xp', g.job_level_xp[job_level(cj.xp) + 1],
        'shifts', cj.shifts,
        'pay', job_pay(j.base_pay, job_level(cj.xp)),
        'shift_minutes', j.shift_minutes,
        'shift_start_hour', j.shift_start_hour,
        'shift_end_hour', j.shift_end_hour,
        'effects', j.effects
      )
      from character_jobs cj
      join jobs j on j.code = cj.job_code
      join buildings b on b.code = j.building_code
      where cj.character_id = c.id and cj.is_active
    ),
    'careers', coalesce((
      select jsonb_agg(jsonb_build_object('code', cj.job_code, 'level', job_level(cj.xp), 'xp', cj.xp, 'shifts', cj.shifts, 'is_active', cj.is_active) order by cj.hired_at)
      from character_jobs cj where cj.character_id = c.id
    ), '[]'::jsonb)
  )
  from characters c, game_config g
  where c.id = p_character;
$$;

-- -----------------------------------------------------------------------------
-- Fonctions publiques
-- -----------------------------------------------------------------------------

-- Étape 3 : création du personnage (un par compte).
create function public.create_character(
  p_first_name text,
  p_pseudo text,
  p_gender text,
  p_age integer,
  p_city_code text,
  p_appearance jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg game_config;
  v_city cities;
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_pseudo text := btrim(coalesce(p_pseudo, ''));
  v_id uuid;
begin
  if auth.uid() is null then
    perform _fail('not_authenticated', 'Connectez-vous pour créer votre personnage.');
  end if;
  if exists (select 1 from characters where user_id = auth.uid()) then
    perform _fail('character_exists', 'Vous avez déjà un personnage.');
  end if;
  if v_first_name !~ '^[[:alpha:]][[:alpha:] ''-]{0,29}$' then
    perform _fail('invalid_first_name', 'Prénom invalide : 1 à 30 lettres (espaces, tirets et apostrophes acceptés).');
  end if;
  if v_pseudo !~ '^[A-Za-z0-9_.-]{3,20}$' then
    perform _fail('invalid_pseudo', 'Pseudo invalide : 3 à 20 caractères parmi lettres, chiffres, point, tiret et tiret bas.');
  end if;
  if exists (select 1 from characters where lower(pseudo) = lower(v_pseudo)) then
    perform _fail('pseudo_taken', 'Ce pseudo est déjà pris.');
  end if;
  if p_gender is null or p_gender not in ('homme', 'femme') then
    perform _fail('invalid_gender', 'Choisissez un personnage homme ou femme.');
  end if;
  if p_age is null or p_age not between 18 and 60 then
    perform _fail('invalid_age', 'L''âge du personnage doit être compris entre 18 et 60 ans.');
  end if;
  select * into v_city from cities where code = p_city_code;
  if not found then
    perform _fail('unknown_city', 'Ville inconnue.');
  end if;
  if not v_city.is_open then
    perform _fail('city_closed', format('%s ouvrira bientôt. Commencez votre vie à Cotonou.', v_city.name));
  end if;
  if p_appearance is null or jsonb_typeof(p_appearance) <> 'object'
     or (select count(*) from jsonb_object_keys(p_appearance)) <> (select count(distinct category) from appearance_options)
     or exists (
       select 1 from jsonb_each(p_appearance) e
       where jsonb_typeof(e.value) <> 'string'
          or not exists (select 1 from appearance_options o where o.category = e.key and o.code = e.value #>> '{}')
     ) then
    perform _fail('invalid_appearance', 'Apparence invalide : choisissez une option dans chaque catégorie.');
  end if;

  select * into cfg from game_config;
  begin
    insert into characters (
      user_id, first_name, pseudo, gender, age, appearance, country_code, city_code, district_code,
      hunger, energy, hygiene, fun, social, bladder
    ) values (
      auth.uid(), v_first_name, v_pseudo, p_gender, p_age, p_appearance, v_city.country_code, v_city.code, v_city.spawn_district_code,
      cfg.starting_needs, cfg.starting_needs, cfg.starting_needs, cfg.starting_needs, cfg.starting_needs, cfg.starting_needs
    ) returning id into v_id;
  exception when unique_violation then
    perform _fail('pseudo_taken', 'Ce pseudo est déjà pris.');
  end;
  perform _money(v_id, cfg.starting_cash, 'starting_cash', null);
  return _state(v_id);
end $$;

-- État du joueur connecté, recalculé jusqu'à maintenant. null s'il n'a pas encore de personnage.
create function public.game_state() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    perform _fail('not_authenticated', 'Connectez-vous pour jouer.');
  end if;
  select id into v_id from characters where user_id = auth.uid() for update;
  if v_id is null then
    return null;
  end if;
  perform _settle(v_id);
  return _state(v_id);
end $$;

-- Étapes 5 et 6 : lancer une activité dans le lieu où l'on se trouve.
create function public.start_activity(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  c characters;
  v record;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  select * into c from characters where id = v_id;

  select a.*, b.district_code, b.name as building_name, b.open_hour, b.close_hour, d.name as district_name
    into v
  from activities a
  left join buildings b on b.code = a.building_code
  left join districts d on d.code = b.district_code
  where a.code = p_code and a.is_active;
  if not found then
    perform _fail('unknown_activity', 'Cette activité n''existe pas.');
  end if;
  if v.building_code is not null and v.district_code <> c.district_code then
    perform _fail('wrong_place', format('Rendez-vous d''abord à %s (%s).', v.building_name, v.district_name));
  end if;
  if v.building_code is not null and not building_is_open(v.open_hour, v.close_hour, game_minute(now())) then
    perform _fail('closed', format('%s est fermé à cette heure (ouvert de %sh à %sh).', v.building_name, v.open_hour, v.close_hour % 24));
  end if;

  perform _money(v_id, -v.price, 'activity', v.code);
  update characters set
    activity = jsonb_build_object('kind', 'activity', 'code', v.code, 'label', v.name, 'effects', v.effects, 'xp', v.xp, 'cost', v.price),
    activity_started_at = now(),
    activity_ends_at = now() + real_duration(v.duration_minutes)
  where id = v_id;
  return _state(v_id);
end $$;

-- Étape 4 : prix et durée des trajets d'un quartier vers tous les autres de la même ville.
create function public.travel_quotes(p_from text)
returns table (to_district text, mode_code text, km numeric, fare bigint, game_minutes integer, effects jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    t.code,
    m.code,
    round(q.km, 1),
    case when m.base_fare = 0 and m.fare_per_km = 0 then 0
         else greatest(m.base_fare, (round((m.base_fare + m.fare_per_km * q.km) / 50.0) * 50)::bigint) end,
    greatest(5, ceil(m.minutes_per_km * q.km))::integer,
    coalesce((select jsonb_object_agg(e.key, round((e.value #>> '{}')::numeric * q.km, 1)) from jsonb_each(m.effects_per_km) e), '{}'::jsonb)
  from districts f
  join districts t on t.city_code = f.city_code and t.code <> f.code
  cross join lateral (select sqrt(power(t.x_km - f.x_km, 2) + power(t.y_km - f.y_km, 2))::numeric as km) q
  cross join transport_modes m
  where f.code = p_from
  order by t.code, m.sort;
$$;

-- Étape 4 : se déplacer vers un autre quartier.
create function public.travel_to(p_district text, p_mode text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  c characters;
  v_to districts;
  v_mode transport_modes;
  q record;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  select * into c from characters where id = v_id;

  select * into v_to from districts where code = p_district;
  if not found or v_to.city_code <> c.city_code then
    perform _fail('unknown_district', 'Ce quartier n''existe pas dans votre ville.');
  end if;
  if v_to.code = c.district_code then
    perform _fail('already_there', format('Vous êtes déjà à %s.', v_to.name));
  end if;
  select * into v_mode from transport_modes where code = p_mode;
  if not found then
    perform _fail('unknown_transport', 'Moyen de transport inconnu.');
  end if;
  select * into q from travel_quotes(c.district_code) t where t.to_district = v_to.code and t.mode_code = v_mode.code;

  perform _money(v_id, -q.fare, 'travel', v_mode.code);
  update characters set
    activity = jsonb_build_object(
      'kind', 'travel', 'code', v_mode.code,
      'label', format('Trajet vers %s (%s)', v_to.name, lower(v_mode.name)),
      'to_district', v_to.code, 'effects', q.effects, 'xp', 0, 'cost', q.fare, 'km', q.km
    ),
    activity_started_at = now(),
    activity_ends_at = now() + real_duration(q.game_minutes)
  where id = v_id;
  return _state(v_id);
end $$;

-- Étape 7 : postuler (sur place) à un métier. Quitte l'emploi actuel s'il y en a un.
create function public.apply_for_job(p_job text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  c characters;
  v record;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  select * into c from characters where id = v_id;

  select j.*, b.district_code, b.name as building_name, d.name as district_name
    into v
  from jobs j
  join buildings b on b.code = j.building_code
  join districts d on d.code = b.district_code
  where j.code = p_job and j.is_active;
  if not found then
    perform _fail('unknown_job', 'Ce métier n''existe pas.');
  end if;
  if v.district_code <> c.district_code then
    perform _fail('wrong_place', format('Pour postuler, rendez-vous à %s (%s).', v.building_name, v.district_name));
  end if;
  if player_level(c.xp) < v.required_level then
    perform _fail('level_too_low', format('Ce poste demande le niveau %s (vous êtes niveau %s).', v.required_level, player_level(c.xp)));
  end if;
  if exists (select 1 from character_jobs where character_id = v_id and job_code = v.code and is_active) then
    perform _fail('already_hired', 'Vous occupez déjà ce poste.');
  end if;

  update character_jobs set is_active = false, left_at = now() where character_id = v_id and is_active;
  insert into character_jobs (character_id, job_code) values (v_id, v.code)
  on conflict (character_id, job_code) do update set is_active = true, hired_at = now(), left_at = null;
  return _state(v_id);
end $$;

-- Étape 7 : démissionner.
create function public.quit_job() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := _lock_my_character();
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  update character_jobs set is_active = false, left_at = now() where character_id = v_id and is_active;
  if not found then
    perform _fail('no_job', 'Vous n''avez pas d''emploi.');
  end if;
  return _state(v_id);
end $$;

-- Étape 7 : faire un service de travail.
create function public.start_work() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  cfg game_config;
  c characters;
  v record;
  v_minute integer;
  v_level integer;
  v_pay bigint;
  t record;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  select * into cfg from game_config;
  select * into c from characters where id = v_id;

  select cj.xp as job_xp, j.*, b.district_code, b.name as building_name, d.name as district_name
    into v
  from character_jobs cj
  join jobs j on j.code = cj.job_code
  join buildings b on b.code = j.building_code
  join districts d on d.code = b.district_code
  where cj.character_id = v_id and cj.is_active;
  if not found then
    perform _fail('no_job', 'Vous n''avez pas d''emploi. Postulez dans un lieu qui recrute.');
  end if;
  if v.district_code <> c.district_code then
    perform _fail('wrong_place', format('Votre lieu de travail est %s, à %s.', v.building_name, v.district_name));
  end if;
  v_minute := (game_minute(now()) % 1440)::integer;
  if v_minute < v.shift_start_hour * 60 or v_minute + v.shift_minutes > v.shift_end_hour * 60 then
    perform _fail('outside_shift', format('Les services ont lieu entre %sh et %sh (dernier départ à %sh%s).',
      v.shift_start_hour, v.shift_end_hour % 24,
      (v.shift_end_hour * 60 - v.shift_minutes) / 60, lpad(((v.shift_end_hour * 60 - v.shift_minutes) % 60)::text, 2, '0')));
  end if;
  for t in select e.key, (e.value #>> '{}')::float8 as minimum from jsonb_each(cfg.work_min_needs) e loop
    if (to_jsonb(c) ->> t.key)::float8 < t.minimum then
      perform _fail('needs_too_low', case t.key
        when 'energy' then format('Vous êtes trop %s pour travailler. Reposez-vous d''abord.', _g(c.gender, 'fatigué', 'fatiguée'))
        when 'hunger' then 'Vous avez trop faim pour travailler. Mangez d''abord.'
        when 'bladder' then 'Passez d''abord aux toilettes.'
        else 'Vous n''êtes pas en état de travailler.'
      end);
    end if;
  end loop;

  v_level := job_level(v.job_xp);
  v_pay := job_pay(v.base_pay, v_level);
  update characters set
    activity = jsonb_build_object(
      'kind', 'work', 'code', v.code,
      'label', format('Service : %s', _g(c.gender, v.name, coalesce(v.name_feminine, v.name))),
      'effects', v.effects, 'earn', v_pay, 'xp', cfg.player_xp_per_shift, 'job_xp', v.xp_per_shift, 'cost', 0
    ),
    activity_started_at = now(),
    activity_ends_at = now() + real_duration(v.shift_minutes)
  where id = v_id;
  return _state(v_id);
end $$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution : rien par défaut, puis liste blanche explicite.
-- (Supabase accorde EXECUTE à anon/authenticated sur toute nouvelle fonction.)
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
  public.travel_quotes(text)
to anon, authenticated;

grant execute on function
  public.create_character(text, text, text, integer, text, jsonb),
  public.game_state(),
  public.start_activity(text),
  public.travel_to(text, text),
  public.apply_for_job(text),
  public.quit_job(),
  public.start_work()
to authenticated;
