-- =============================================================================
-- Étape 9 — Logement (CdC §12, §13, §36) : location, achat, loyer périodique,
-- arriérés, pénalités, perte de confort, expulsion, activités à domicile,
-- notifications. Voir docs/ARCHITECTURE.md §6.6.
-- =============================================================================

-- Réglages du logement.
alter table public.game_config
  add column rent_period_game_days integer not null default 7 check (rent_period_game_days between 1 and 60),
  add column rent_late_penalty numeric not null default 0.10 check (rent_late_penalty between 0 and 1),
  add column rent_max_missed integer not null default 3 check (rent_max_missed >= 1),
  add column home_resale_ratio numeric not null default 0.80 check (home_resale_ratio between 0 and 1);

-- Nouveaux types de lieux et de mouvements d'argent.
alter table public.buildings drop constraint buildings_kind_check;
alter table public.buildings add constraint buildings_kind_check check (kind in (
  'marche', 'maquis', 'restaurant', 'bar', 'toilettes', 'hebergement', 'bureaux', 'supermarche', 'plage', 'sport',
  'cinema', 'garage', 'chantier', 'transport', 'livraison', 'agence'));

alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in (
  'starting_cash', 'activity', 'travel', 'salary', 'mission', 'admin',
  'rent', 'upkeep', 'deposit', 'deposit_refund', 'arrears', 'home_purchase', 'home_sale'));

-- Catalogue des logements (CdC §12).
create table public.homes (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  district_code text not null references public.districts (code),
  name text not null,
  category text not null check (category in ('chambre', 'studio', 'appartement', 'villa', 'maison_luxe', 'penthouse')),
  description text not null default '',
  -- Confort de 1 à 5 : débloque les activités à domicile.
  comfort integer not null check (comfort between 1 and 5),
  capacity integer not null default 1 check (capacity >= 1),
  required_level integer not null default 1 check (required_level >= 1),
  -- Loyer par semaine de jeu ; caution = une semaine de loyer.
  rent_per_week bigint not null check (rent_per_week > 0),
  -- Prix d'achat (null = location seulement) et charges hebdomadaires du propriétaire.
  price bigint check (price > 0),
  upkeep_per_week bigint not null default 0 check (upkeep_per_week >= 0),
  is_active boolean not null default true,
  sort integer not null default 0
);

-- Ce qu'on peut faire chez soi selon le confort du logement.
create table public.home_activities (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null default '',
  min_comfort integer not null default 1 check (min_comfort between 1 and 5),
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  price bigint not null default 0 check (price >= 0),
  effects jsonb not null default '{}' check (_valid_needs_object(effects)),
  xp integer not null default 0 check (xp >= 0),
  sort integer not null default 0
);

-- Logement occupé par un personnage (un seul actif en V1).
create table public.character_homes (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  home_code text not null references public.homes (code),
  tenure text not null check (tenure in ('rental', 'owned')),
  -- Montant prélevé à chaque échéance (loyer ou charges), figé à la signature.
  periodic_charge bigint not null check (periodic_charge >= 0),
  deposit bigint not null default 0 check (deposit >= 0),
  purchase_price bigint check (purchase_price > 0),
  next_due_at timestamptz not null,
  -- Arriérés (loyers impayés + pénalités) et nombre d'échéances manquées depuis le dernier règlement.
  arrears bigint not null default 0 check (arrears >= 0),
  missed integer not null default 0 check (missed >= 0),
  is_active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('depart', 'demenagement', 'expulsion', 'vente')),
  check (is_active = (ended_at is null))
);
create unique index character_homes_one_active on public.character_homes (character_id) where is_active;

-- Notifications du joueur (CdC §36).
create table public.notifications (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  kind text not null check (kind in ('rent_paid', 'rent_missed', 'eviction', 'home')),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_character_idx on public.notifications (character_id, id desc);

do $$
declare t text;
begin
  foreach t in array array['homes', 'home_activities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_lecture', t);
  end loop;
  foreach t in array array['character_homes', 'notifications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (character_id in (select id from public.characters where user_id = (select auth.uid())))',
      t || '_proprietaire', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Moteur
-- -----------------------------------------------------------------------------

-- Durée réelle d'une période de loyer (une semaine de jeu par défaut).
create function public.rent_period() returns interval
language sql stable set search_path = public, pg_temp as $$
  select real_duration(c.rent_period_game_days * 1440) from public.game_config c;
$$;

create function public._notify(p_character uuid, p_kind text, p_message text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into notifications (character_id, kind, message) values (p_character, p_kind, p_message);
$$;

-- Prélève les échéances arrivées à terme (évaluation paresseuse, P2).
-- Solde suffisant : paiement. Sinon : arriéré + pénalité ; trop d'impayés en location : expulsion.
create function public._settle_home(p_character uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg game_config;
  h character_homes;
  v_name text;
  v_cash bigint;
  v_paid integer := 0;
  v_paid_total bigint := 0;
  v_guard integer := 0;
begin
  select * into cfg from game_config;
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 1000;
    select * into h from character_homes where character_id = p_character and is_active for update;
    exit when not found or h.next_due_at > now();
    select name into v_name from homes where code = h.home_code;
    select cash into v_cash from characters where id = p_character;

    if v_cash >= h.periodic_charge then
      perform _money(p_character, -h.periodic_charge, case h.tenure when 'rental' then 'rent' else 'upkeep' end, h.home_code);
      update character_homes set next_due_at = next_due_at + rent_period() where id = h.id;
      v_paid := v_paid + 1;
      v_paid_total := v_paid_total + h.periodic_charge;
    else
      update character_homes set
        arrears = arrears + h.periodic_charge + round(h.periodic_charge * cfg.rent_late_penalty)::bigint,
        missed = missed + 1,
        next_due_at = next_due_at + rent_period()
      where id = h.id
      returning * into h;
      if h.tenure = 'rental' and h.missed >= cfg.rent_max_missed then
        update character_homes set is_active = false, ended_at = now(), end_reason = 'expulsion' where id = h.id;
        perform _notify(p_character, 'eviction', format(
          'Expulsion : %s impayés pour %s. Votre caution de %s FCFA est perdue. Trouvez un nouveau logement.',
          h.missed, v_name, _fcfa(h.deposit)));
        exit;
      end if;
      perform _notify(p_character, 'rent_missed', format(
        '%s impayé(e) pour %s : arriérés de %s FCFA (pénalité de %s %% incluse).%s',
        case h.tenure when 'rental' then 'Loyer' else 'Charges' end, v_name, _fcfa(h.arrears),
        round(cfg.rent_late_penalty * 100),
        case when h.tenure = 'rental'
          then format(' Avertissement %s/%s avant expulsion. Le confort baisse tant que vous devez de l''argent.', h.missed, cfg.rent_max_missed)
          else ' Le confort baisse tant que vous devez de l''argent.' end));
    end if;
  end loop;
  if v_paid > 0 then
    perform _notify(p_character, 'rent_paid', format('%s prélevé(e) : %s FCFA (%s échéance%s).',
      case when h.tenure = 'rental' then 'Loyer' else 'Charges' end, _fcfa(v_paid_total), v_paid, case when v_paid > 1 then 's' else '' end));
  end if;
end $$;

-- _settle : ajoute le prélèvement du logement après la fin d'action et la baisse des besoins.
create or replace function public._settle(p_character uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c characters;
begin
  select * into c from characters where id = p_character for update;
  if c.activity is not null then
    if c.activity_ends_at > now() then
      perform _decay(p_character, now(), false);
      perform _settle_home(p_character);
      return;
    end if;
    perform _decay(p_character, c.activity_ends_at, false);
    perform _complete_activity(p_character);
  end if;
  perform _decay(p_character, now(), true);
  perform _settle_home(p_character);
end $$;

-- Confort effectif : −1 tant qu'il y a des arriérés (« perte de confort », CdC §13).
create function public._effective_comfort(p_comfort integer, p_arrears bigint) returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case when p_arrears > 0 then greatest(0, p_comfort - 1) else p_comfort end;
$$;

-- Termine l'occupation du logement actif : rend la caution (location) ou vend (propriété), arriérés déduits.
create function public._end_home(p_character uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg game_config;
  h character_homes;
  v_back bigint;
begin
  select * into cfg from game_config;
  select * into h from character_homes where character_id = p_character and is_active for update;
  if not found then
    return;
  end if;
  if h.tenure = 'rental' then
    v_back := h.deposit - h.arrears;
    if v_back < 0 then
      perform _fail('arrears_unpaid', format('Réglez d''abord vos arriérés (%s FCFA) : la caution ne suffit pas à les couvrir.', _fcfa(h.arrears)));
    end if;
    if v_back > 0 then
      perform _money(p_character, v_back, 'deposit_refund', h.home_code);
    end if;
  else
    v_back := round(h.purchase_price * cfg.home_resale_ratio)::bigint - h.arrears;
    perform _money(p_character, v_back, 'home_sale', h.home_code);
  end if;
  update character_homes set is_active = false, ended_at = now(), end_reason = p_reason where id = h.id;
end $$;

-- Logement signable : à l'agence, ouverte, niveau suffisant.
create function public._check_home_deal(p_character uuid, p_home text) returns homes
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c characters;
  v_home homes;
  v_agency record;
begin
  select * into c from characters where id = p_character;
  select * into v_home from homes where code = p_home and is_active;
  if not found then
    perform _fail('unknown_home', 'Ce logement n''existe pas.');
  end if;
  select b.*, d.name as district_name into v_agency
  from buildings b join districts d on d.code = b.district_code
  where b.kind = 'agence' and d.city_code = c.city_code
  order by b.sort limit 1;
  if v_agency.district_code is distinct from c.district_code then
    perform _fail('wrong_place', format('Les contrats se signent à %s (%s).', v_agency.name, v_agency.district_name));
  end if;
  if not building_is_open(v_agency.open_hour, v_agency.close_hour, game_minute(now())) then
    perform _fail('closed', format('%s est fermée à cette heure (ouverte de %sh à %sh).', v_agency.name, v_agency.open_hour, v_agency.close_hour % 24));
  end if;
  if player_level(c.xp) < v_home.required_level then
    perform _fail('level_too_low', format('Ce logement demande le niveau %s (vous êtes niveau %s).', v_home.required_level, player_level(c.xp)));
  end if;
  if exists (select 1 from character_homes where character_id = p_character and is_active and home_code = v_home.code) then
    perform _fail('already_home', 'Vous habitez déjà ici.');
  end if;
  return v_home;
end $$;

-- -----------------------------------------------------------------------------
-- Fonctions publiques
-- -----------------------------------------------------------------------------

-- Louer : première semaine + caution d'une semaine, à l'agence. Déménage si besoin.
create function public.rent_home(p_home text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  v_home homes;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  v_home := _check_home_deal(v_id, p_home);
  perform _end_home(v_id, 'demenagement');
  perform _money(v_id, -v_home.rent_per_week, 'rent', v_home.code);
  perform _money(v_id, -v_home.rent_per_week, 'deposit', v_home.code);
  insert into character_homes (character_id, home_code, tenure, periodic_charge, deposit, next_due_at)
  values (v_id, v_home.code, 'rental', v_home.rent_per_week, v_home.rent_per_week, now() + rent_period());
  perform _notify(v_id, 'home', format('Bienvenue chez vous : %s. Prochain loyer de %s FCFA dans une semaine de jeu.', v_home.name, _fcfa(v_home.rent_per_week)));
  return _state(v_id);
end $$;

-- Acheter : prix comptant, puis seulement des charges hebdomadaires.
create function public.buy_home(p_home text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  v_home homes;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  v_home := _check_home_deal(v_id, p_home);
  if v_home.price is null then
    perform _fail('not_for_sale', 'Ce logement est seulement à louer.');
  end if;
  perform _end_home(v_id, 'demenagement');
  perform _money(v_id, -v_home.price, 'home_purchase', v_home.code);
  insert into character_homes (character_id, home_code, tenure, periodic_charge, purchase_price, next_due_at)
  values (v_id, v_home.code, 'owned', v_home.upkeep_per_week, v_home.price, now() + rent_period());
  perform _notify(v_id, 'home', format('Félicitations, vous êtes propriétaire : %s !', v_home.name));
  return _state(v_id);
end $$;

-- Quitter son logement (caution rendue ou bien revendu à 80 %), arriérés déduits.
create function public.leave_home() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  v_tenure text;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  select tenure into v_tenure from character_homes where character_id = v_id and is_active;
  if v_tenure is null then
    perform _fail('no_home', 'Vous n''avez pas de logement.');
  end if;
  perform _end_home(v_id, case v_tenure when 'owned' then 'vente' else 'depart' end);
  return _state(v_id);
end $$;

-- Régler tous les arriérés : le confort revient, le compteur d'avertissements repart à zéro.
create function public.pay_home_arrears() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  h character_homes;
begin
  perform _settle(v_id);
  select * into h from character_homes where character_id = v_id and is_active for update;
  if not found or h.arrears = 0 then
    perform _fail('no_arrears', 'Vous n''avez aucun arriéré.');
  end if;
  perform _money(v_id, -h.arrears, 'arrears', h.home_code);
  update character_homes set arrears = 0, missed = 0 where id = h.id;
  return _state(v_id);
end $$;

-- Activité à domicile : il faut être dans le quartier du logement et un confort suffisant.
create function public.start_home_activity(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  c characters;
  v home_activities;
  h record;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  select * into c from characters where id = v_id;
  select ch.*, ho.name, ho.district_code, ho.comfort, d.name as district_name into h
  from character_homes ch
  join homes ho on ho.code = ch.home_code
  join districts d on d.code = ho.district_code
  where ch.character_id = v_id and ch.is_active;
  if not found then
    perform _fail('no_home', 'Vous n''avez pas de logement. Louez-en un à l''agence immobilière.');
  end if;
  select * into v from home_activities where code = p_code;
  if not found then
    perform _fail('unknown_activity', 'Cette activité n''existe pas.');
  end if;
  if h.district_code <> c.district_code then
    perform _fail('wrong_place', format('Rentrez d''abord chez vous (%s).', h.district_name));
  end if;
  if _effective_comfort(h.comfort, h.arrears) < v.min_comfort then
    perform _fail('comfort_too_low', case when h.arrears > 0
      then 'Coupure en cours : réglez vos arriérés pour retrouver tout le confort de votre logement.'
      else format('Votre logement n''est pas assez équipé (confort %s requis).', v.min_comfort) end);
  end if;

  perform _money(v_id, -v.price, 'activity', v.code);
  update characters set
    activity = jsonb_build_object('kind', 'activity', 'code', v.code, 'label', v.name, 'effects', v.effects, 'xp', v.xp, 'cost', v.price),
    activity_started_at = now(),
    activity_ends_at = now() + real_duration(v.duration_minutes)
  where id = v_id;
  return _state(v_id);
end $$;

create function public.mark_notifications_read() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := _lock_my_character();
begin
  update notifications set read_at = now() where character_id = v_id and read_at is null;
end $$;

-- _state : ajoute le logement et le nombre de notifications non lues.
create or replace function public._state(p_character uuid) returns jsonb
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
    ), '[]'::jsonb),
    'home', (
      select jsonb_build_object(
        'code', ho.code,
        'name', ho.name,
        'category', ho.category,
        'district_code', ho.district_code,
        'comfort', ho.comfort,
        'effective_comfort', _effective_comfort(ho.comfort, ch.arrears),
        'tenure', ch.tenure,
        'periodic_charge', ch.periodic_charge,
        'deposit', ch.deposit,
        'purchase_price', ch.purchase_price,
        'resale_value', case when ch.tenure = 'owned' then round(ch.purchase_price * g.home_resale_ratio)::bigint end,
        'next_due_at', ch.next_due_at,
        'arrears', ch.arrears,
        'missed', ch.missed,
        'max_missed', g.rent_max_missed
      )
      from character_homes ch join homes ho on ho.code = ch.home_code
      where ch.character_id = c.id and ch.is_active
    ),
    'unread_notifications', (select count(*) from notifications n where n.character_id = c.id and n.read_at is null)
  )
  from characters c, game_config g
  where c.id = p_character;
$$;

-- -----------------------------------------------------------------------------
-- Données de lancement (Cotonou)
-- -----------------------------------------------------------------------------

insert into public.buildings (code, district_code, name, kind, description, open_hour, close_hour, sort) values
  ('agence_immobiliere', 'ganhi', 'Agence immobilière du Littoral', 'agence', 'Location et vente de logements dans tout Cotonou.', 8, 18, 3);

insert into public.homes (code, district_code, name, category, description, comfort, capacity, required_level, rent_per_week, price, upkeep_per_week, sort) values
  ('chambre_akpakpa', 'akpakpa', 'Chambre « entrer-coucher » à Akpakpa', 'chambre', 'Une pièce, toilettes et point d''eau dans la cour.', 1, 1, 1, 12000, null, 0, 1),
  ('chambre_agla', 'agla', 'Chambre à Agla', 'chambre', 'Une pièce au calme, toilettes partagées.', 1, 1, 1, 15000, null, 0, 2),
  ('studio_gbegamey', 'gbegamey', 'Studio à Gbégamey', 'studio', 'Chambre-salon, coin cuisine, douche.', 2, 1, 1, 35000, 6000000, 9000, 3),
  ('studio_cadjehoun', 'cadjehoun', 'Studio meublé à Cadjèhoun', 'studio', 'Meublé, ventilé, à deux pas de la salle de sport.', 2, 1, 2, 40000, 7500000, 10000, 4),
  ('appart_cadjehoun', 'cadjehoun', 'Appartement 2 chambres à Cadjèhoun', 'appartement', 'Salon, cuisine équipée, télévision.', 3, 3, 3, 90000, 18000000, 22000, 5),
  ('appart_fidjrosse', 'fidjrosse', 'Appartement vue mer à Fidjrossè', 'appartement', 'Balcon face à l''océan, climatisation.', 3, 3, 3, 110000, 22000000, 27000, 6),
  ('villa_haie_vive', 'haie_vive', 'Villa avec piscine à Haie Vive', 'villa', 'Quatre chambres, jardin, piscine.', 4, 6, 5, 300000, 75000000, 75000, 7),
  ('maison_luxe_haie_vive', 'haie_vive', 'Maison de luxe à Haie Vive', 'maison_luxe', 'Architecture contemporaine, domotique, gardien.', 5, 8, 7, 700000, 180000000, 175000, 8),
  ('penthouse_ganhi', 'ganhi', 'Penthouse au sommet de la tour de Ganhi', 'penthouse', 'Terrasse panoramique sur la ville et la lagune.', 5, 6, 8, 1000000, 300000000, 250000, 9);

insert into public.home_activities (code, name, description, min_comfort, duration_minutes, price, effects, xp, sort) values
  ('maison_dormir', 'Dormir chez soi', '8 heures de sommeil.', 1, 480, 0, '{"energy": 100}', 1, 1),
  ('maison_sieste', 'Faire une sieste', '', 1, 120, 0, '{"energy": 30}', 0, 2),
  ('maison_toilettes', 'Aller aux toilettes', '', 1, 10, 0, '{"bladder": 100}', 0, 3),
  ('maison_seau', 'Se laver au seau', '', 1, 15, 0, '{"hygiene": 50}', 0, 4),
  ('maison_douche', 'Prendre une douche', '', 2, 15, 0, '{"hygiene": 75}', 0, 5),
  ('maison_cuisiner', 'Cuisiner un repas', 'Ingrédients achetés au marché du coin.', 2, 45, 800, '{"hunger": 50, "fun": 5}', 1, 6),
  ('maison_tele', 'Regarder la télévision', '', 3, 60, 0, '{"fun": 20}', 0, 7),
  ('maison_piscine', 'Se baigner dans la piscine', '', 4, 60, 0, '{"fun": 30, "energy": 5, "hygiene": -5}', 1, 8),
  ('maison_recevoir', 'Recevoir des amis', 'Boissons et grillades pour tout le monde.', 4, 120, 5000, '{"social": 40, "fun": 20, "bladder": -15}', 3, 9);

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
  public.rent_period()
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
  public.mark_notifications_read()
to authenticated;
