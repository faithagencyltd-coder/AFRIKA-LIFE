-- =============================================================================
-- Étapes 4, 6, 7 — Catalogue du monde : réglages, pays, villes, quartiers,
-- lieux, activités, transports, métiers, options d'apparence.
-- Lecture publique, aucune écriture depuis l'API (voir docs/ARCHITECTURE.md §5).
-- =============================================================================

-- Réglages globaux du jeu (une seule ligne).
create table public.game_config (
  id boolean primary key default true check (id),
  -- Horloge partagée : minute de jeu = start_game_minute + (now - world_epoch) × time_scale.
  world_epoch timestamptz not null,
  time_scale integer not null check (time_scale between 1 and 1440),
  start_game_minute integer not null check (start_game_minute >= 0),
  starting_cash bigint not null check (starting_cash >= 0),
  starting_needs double precision not null check (starting_needs between 0 and 100),
  -- Baisse de chaque besoin par heure de jeu.
  need_decay jsonb not null,
  -- Plafond de baisse des besoins pendant une absence (minutes réelles).
  idle_cap_minutes integer not null check (idle_cap_minutes > 0),
  -- XP de métier cumulée requise pour chaque niveau (index 1 = niveau 1).
  job_level_xp integer[] not null,
  -- Hausse du salaire par niveau de métier (0,25 = +25 %).
  job_level_pay_bonus numeric not null check (job_level_pay_bonus >= 0),
  -- XP de joueur gagnée par service de travail.
  player_xp_per_shift integer not null check (player_xp_per_shift >= 0),
  -- Seuils minimaux des besoins pour pouvoir travailler.
  work_min_needs jsonb not null
);

-- Les six besoins du personnage (§7), dans l'ordre d'affichage.
create function public.need_keys() returns text[]
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select array['hunger', 'energy', 'hygiene', 'fun', 'social', 'bladder'];
$$;

-- Un objet d'effets ne contient que des besoins, avec des valeurs numériques entre -100 et 100.
create function public._valid_needs_object(p jsonb) returns boolean
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) e
      where e.key <> all (public.need_keys())
         or jsonb_typeof(e.value) <> 'number'
         or (e.value)::text::numeric not between -100 and 100
    );
$$;

alter table public.game_config
  add constraint game_config_need_decay_valid check (_valid_needs_object(need_decay)),
  add constraint game_config_work_min_needs_valid check (_valid_needs_object(work_min_needs)),
  add constraint game_config_job_level_xp_valid check (cardinality(job_level_xp) >= 1 and job_level_xp[1] = 0);

create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  flag text not null,
  currency text not null default 'XOF',
  is_open boolean not null default false,
  sort integer not null default 0
);

create table public.cities (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  country_code text not null references public.countries (code),
  name text not null,
  is_open boolean not null default false,
  spawn_district_code text,
  release_label text,
  sort integer not null default 0
);

create table public.districts (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  city_code text not null references public.cities (code),
  name text not null,
  kind text not null check (kind in ('centre', 'marche', 'premium', 'residentiel', 'plage', 'populaire', 'industriel', 'carrefour')),
  description text not null default '',
  -- Position schématique du centre du quartier (km) pour la carte et le calcul des trajets.
  x_km numeric(6, 2) not null,
  y_km numeric(6, 2) not null
);
create index districts_city_idx on public.districts (city_code);

alter table public.cities
  add constraint cities_spawn_district_fk foreign key (spawn_district_code) references public.districts (code);

create table public.buildings (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  district_code text not null references public.districts (code),
  name text not null,
  kind text not null check (kind in ('marche', 'maquis', 'restaurant', 'bar', 'toilettes', 'hebergement', 'bureaux', 'supermarche', 'plage', 'sport', 'cinema', 'garage', 'chantier', 'transport', 'livraison')),
  description text not null default '',
  -- Heures d'ouverture (heure de jeu). 0 → 24 : toujours ouvert ; ouverture > fermeture : ouvert la nuit.
  open_hour integer not null default 0 check (open_hour between 0 and 23),
  close_hour integer not null default 24 check (close_hour between 1 and 24),
  sort integer not null default 0
);
create index buildings_district_idx on public.buildings (district_code);

create table public.activities (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  -- null = faisable partout (ex. appeler la famille).
  building_code text references public.buildings (code),
  name text not null,
  description text not null default '',
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  price bigint not null default 0 check (price >= 0),
  effects jsonb not null default '{}' check (_valid_needs_object(effects)),
  xp integer not null default 0 check (xp >= 0),
  is_active boolean not null default true,
  sort integer not null default 0
);
create index activities_building_idx on public.activities (building_code);

create table public.transport_modes (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  icon text not null,
  base_fare bigint not null check (base_fare >= 0),
  fare_per_km bigint not null check (fare_per_km >= 0),
  minutes_per_km numeric(5, 2) not null check (minutes_per_km > 0),
  -- Effet sur les besoins par km parcouru (ex. la marche fatigue).
  effects_per_km jsonb not null default '{}' check (_valid_needs_object(effects_per_km)),
  sort integer not null default 0
);

create table public.jobs (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  building_code text not null references public.buildings (code),
  name text not null,
  name_feminine text,
  description text not null default '',
  tier text not null default 'debutant' check (tier in ('debutant', 'intermediaire', 'haut')),
  required_level integer not null default 1 check (required_level >= 1),
  -- Salaire d'un service au niveau 1 du métier (FCFA virtuels).
  base_pay bigint not null check (base_pay > 0),
  shift_minutes integer not null default 120 check (shift_minutes between 30 and 720),
  -- Fenêtre horaire dans laquelle un service doit commencer ET finir.
  shift_start_hour integer not null check (shift_start_hour between 0 and 23),
  shift_end_hour integer not null check (shift_end_hour between 1 and 24),
  xp_per_shift integer not null default 10 check (xp_per_shift >= 0),
  -- Effet d'un service sur les besoins (fatigue, saleté…).
  effects jsonb not null default '{}' check (_valid_needs_object(effects)),
  is_active boolean not null default true,
  sort integer not null default 0,
  check (shift_end_hour * 60 - shift_start_hour * 60 >= shift_minutes)
);
create index jobs_building_idx on public.jobs (building_code);

-- Valeurs autorisées pour la personnalisation du personnage (§6).
create table public.appearance_options (
  category text not null check (category in ('skin', 'face', 'hair', 'outfit', 'outfit_color', 'shoes', 'accessory')),
  code text not null check (code ~ '^[a-z0-9_]+$'),
  label text not null,
  sort integer not null default 0,
  primary key (category, code)
);

-- -----------------------------------------------------------------------------
-- Horloge du jeu (§8)
-- -----------------------------------------------------------------------------

-- Minute de jeu absolue (0 = jour 1 à 00:00) à l'instant donné.
create function public.game_minute(p_at timestamptz default now()) returns bigint
language sql stable set search_path = public, pg_temp as $$
  select c.start_game_minute + floor(extract(epoch from (p_at - c.world_epoch)) / 60.0 * c.time_scale)::bigint
  from public.game_config c;
$$;

-- Durée réelle d'une durée de jeu (en minutes de jeu).
create function public.real_duration(p_game_minutes numeric) returns interval
language sql stable set search_path = public, pg_temp as $$
  select make_interval(secs => p_game_minutes * 60.0 / c.time_scale) from public.game_config c;
$$;

-- Un lieu est-il ouvert à la minute de jeu donnée ?
create function public.building_is_open(p_open integer, p_close integer, p_minute bigint) returns boolean
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select case
    when p_open = 0 and p_close = 24 then true
    when p_open < p_close then (p_minute % 1440) / 60 >= p_open and (p_minute % 1440) / 60 < p_close
    else (p_minute % 1440) / 60 >= p_open or (p_minute % 1440) / 60 < p_close
  end;
$$;

-- Niveau global du joueur : 100 XP pour le niveau 2, 300 pour le 3, 600 pour le 4…
create function public.player_level(p_xp bigint) returns integer
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select floor((1 + sqrt(1 + 8 * greatest(p_xp, 0) / 100.0)) / 2)::integer;
$$;

-- Niveau dans un métier selon les seuils de game_config.job_level_xp.
create function public.job_level(p_xp integer) returns integer
language sql stable set search_path = public, pg_temp as $$
  select count(*)::integer from public.game_config c, unnest(c.job_level_xp) t where t <= greatest(p_xp, 0);
$$;

-- Salaire d'un service selon le niveau, arrondi à 50 FCFA.
create function public.job_pay(p_base_pay bigint, p_level integer) returns bigint
language sql stable set search_path = public, pg_temp as $$
  select (round(p_base_pay * (1 + c.job_level_pay_bonus * (p_level - 1)) / 50.0) * 50)::bigint from public.game_config c;
$$;

-- -----------------------------------------------------------------------------
-- Droits : lecture seule pour tout le monde, aucune écriture depuis l'API.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['game_config', 'countries', 'cities', 'districts', 'buildings', 'activities', 'transport_modes', 'jobs', 'appearance_options'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_lecture', t);
  end loop;
end $$;

revoke execute on function public._valid_needs_object(jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Données de lancement
-- -----------------------------------------------------------------------------

insert into public.game_config (
  world_epoch, time_scale, start_game_minute, starting_cash, starting_needs, need_decay, idle_cap_minutes,
  job_level_xp, job_level_pay_bonus, player_xp_per_shift, work_min_needs
) values (
  '2026-10-01 00:00:00+00', 15, 7 * 60, 500000, 80,
  '{"hunger": 5, "energy": 4, "hygiene": 3, "fun": 3, "social": 2, "bladder": 8}',
  30,
  array[0, 40, 120, 240, 400], 0.25, 10,
  '{"energy": 20, "hunger": 15, "bladder": 10}'
);

insert into public.countries (code, name, flag, is_open, sort) values
  ('BJ', 'Bénin', '🇧🇯', true, 1),
  ('TG', 'Togo', '🇹🇬', false, 2),
  ('CI', 'Côte d''Ivoire', '🇨🇮', false, 3);

insert into public.cities (code, country_code, name, is_open, spawn_district_code, release_label, sort) values
  ('cotonou', 'BJ', 'Cotonou', true, null, null, 1),
  ('abomey_calavi', 'BJ', 'Abomey-Calavi', false, null, 'Bientôt', 2),
  ('porto_novo', 'BJ', 'Porto-Novo', false, null, 'Bientôt', 3),
  ('lome', 'TG', 'Lomé', false, null, 'Prochaine ville', 4),
  ('abidjan', 'CI', 'Abidjan', false, null, 'Bientôt', 5),
  ('yamoussoukro', 'CI', 'Yamoussoukro', false, null, 'Bientôt', 6),
  ('bouake', 'CI', 'Bouaké', false, null, 'Bientôt', 7);

insert into public.districts (code, city_code, name, kind, description, x_km, y_km) values
  ('fidjrosse', 'cotonou', 'Fidjrossè', 'plage', 'Le bord de mer, ses paillotes et ses buvettes.', 2.0, 1.2),
  ('cadjehoun', 'cotonou', 'Cadjèhoun', 'residentiel', 'Quartier résidentiel calme, près de l''aéroport.', 4.4, 2.3),
  ('haie_vive', 'cotonou', 'Haie Vive', 'premium', 'Restaurants, lounges et sorties chics.', 5.6, 1.4),
  ('gbegamey', 'cotonou', 'Gbégamey · Étoile Rouge', 'carrefour', 'Le grand carrefour : taxis, livraisons et cinéma.', 6.0, 4.0),
  ('agla', 'cotonou', 'Agla', 'populaire', 'Quartier populaire et animé, où tout commence.', 3.0, 5.4),
  ('ganhi', 'cotonou', 'Ganhi', 'centre', 'Le centre-ville : bureaux, banques et supermarché.', 8.4, 1.6),
  ('dantokpa', 'cotonou', 'Dantokpa', 'marche', 'Le plus grand marché d''Afrique de l''Ouest.', 8.8, 3.6),
  ('akpakpa', 'cotonou', 'Akpakpa', 'industriel', 'De l''autre côté de la lagune : garages et chantiers.', 11.2, 2.6);

update public.cities set spawn_district_code = 'agla' where code = 'cotonou';
-- Une ville ouverte doit avoir un quartier d'arrivée.
alter table public.cities add constraint cities_open_has_spawn check (not is_open or spawn_district_code is not null);

insert into public.buildings (code, district_code, name, kind, description, open_hour, close_hour, sort) values
  ('marche_dantokpa', 'dantokpa', 'Grand marché Dantokpa', 'marche', 'Étals de pagnes, de vivres et de tout le reste.', 6, 19, 1),
  ('maquis_tantie_rose', 'dantokpa', 'Maquis Chez Tantie Rose', 'maquis', 'Pâte rouge, poisson braisé et bonne ambiance.', 8, 23, 2),
  ('wc_dantokpa', 'dantokpa', 'WC publics du marché', 'toilettes', '100 FCFA le passage.', 6, 21, 3),
  ('supermarche_ganhi', 'ganhi', 'Supermarché du Centre', 'supermarche', 'Climatisé, rayons bien rangés.', 8, 21, 1),
  ('bureaux_ganhi', 'ganhi', 'Tour d''affaires de Ganhi', 'bureaux', 'Sièges d''entreprises et bureaux partagés.', 6, 22, 2),
  ('restaurant_baobab', 'haie_vive', 'Restaurant Le Baobab', 'restaurant', 'Cuisine béninoise revisitée, terrasse ombragée.', 11, 23, 1),
  ('lounge_haie_vive', 'haie_vive', 'Lounge Haie Vive', 'bar', 'Musique, cocktails et rencontres jusque tard.', 18, 2, 2),
  ('salle_sport_cadjehoun', 'cadjehoun', 'Salle de sport Énergie', 'sport', 'Musculation, cardio et douches.', 6, 22, 1),
  ('plage_fidjrosse', 'fidjrosse', 'Plage de Fidjrossè', 'plage', 'Sable, vagues et paillotes.', 6, 19, 1),
  ('buvette_la_vague', 'fidjrosse', 'Buvette La Vague', 'maquis', 'Poisson grillé et alloco face à la mer.', 10, 23, 2),
  ('garage_akpakpa', 'akpakpa', 'Garage mécanique d''Akpakpa', 'garage', 'Motos, taxis et voitures en réparation.', 7, 19, 1),
  ('chantier_akpakpa', 'akpakpa', 'Grand chantier d''Akpakpa', 'chantier', 'Un immeuble de six étages sort de terre.', 6, 18, 2),
  ('maquis_carrefour', 'akpakpa', 'Maquis Le Carrefour', 'maquis', 'Le repas des travailleurs du quartier.', 7, 22, 3),
  ('auberge_la_paix', 'agla', 'Auberge La Paix', 'hebergement', 'Chambres simples, douche et toilettes. Ouvert jour et nuit.', 0, 24, 1),
  ('maquis_bon_coin', 'agla', 'Maquis Le Bon Coin', 'maquis', 'Petits prix, grandes portions.', 8, 23, 2),
  ('station_etoile_rouge', 'gbegamey', 'Station de taxis de l''Étoile Rouge', 'transport', 'Taxis-ville pour toute la ville.', 5, 22, 1),
  ('express_livraison', 'gbegamey', 'Express Livraison Cotonou', 'livraison', 'Colis et repas livrés à moto.', 7, 21, 2),
  ('cine_etoile', 'gbegamey', 'Ciné Étoile', 'cinema', 'Films africains et internationaux.', 14, 24, 3);

insert into public.activities (code, building_code, name, description, duration_minutes, price, effects, xp, sort) values
  -- Partout
  ('appeler_famille', null, 'Appeler la famille', 'Un peu de crédit pour prendre des nouvelles.', 15, 100, '{"social": 20, "fun": 5}', 1, 1),
  -- Dantokpa
  ('marche_grignoter', 'marche_dantokpa', 'Acheter des beignets et de l''akassa', 'De quoi tenir jusqu''au prochain repas.', 20, 500, '{"hunger": 20}', 1, 1),
  ('marche_fleaner', 'marche_dantokpa', 'Flâner dans les allées', 'Regarder, marchander, saluer.', 45, 0, '{"fun": 12, "social": 10, "energy": -4}', 1, 2),
  ('maquis_tantie_plat', 'maquis_tantie_rose', 'Manger un plat de pâte rouge au poisson', '', 30, 1500, '{"hunger": 45, "social": 5}', 1, 1),
  ('maquis_tantie_causer', 'maquis_tantie_rose', 'Boire une sucrerie et causer', '', 45, 700, '{"social": 20, "fun": 10, "bladder": -10}', 1, 2),
  ('wc_dantokpa_utiliser', 'wc_dantokpa', 'Utiliser les toilettes', '', 10, 100, '{"bladder": 100, "hygiene": -3}', 0, 1),
  -- Ganhi
  ('supermarche_sandwich', 'supermarche_ganhi', 'Prendre un sandwich et un jus', '', 15, 2000, '{"hunger": 30}', 1, 1),
  ('supermarche_toilettes', 'supermarche_ganhi', 'Toilettes clients', '', 10, 0, '{"bladder": 100}', 0, 2),
  ('bureaux_toilettes', 'bureaux_ganhi', 'Toilettes du hall', '', 10, 0, '{"bladder": 100}', 0, 1),
  -- Haie Vive
  ('baobab_diner', 'restaurant_baobab', 'Dîner au restaurant', 'Entrée, plat, dessert.', 60, 7500, '{"hunger": 70, "fun": 15, "social": 10}', 2, 1),
  ('baobab_toilettes', 'restaurant_baobab', 'Toilettes du restaurant', '', 10, 0, '{"bladder": 100}', 0, 2),
  ('lounge_soiree', 'lounge_haie_vive', 'Passer la soirée entre amis', '', 120, 5000, '{"fun": 35, "social": 35, "energy": -10, "bladder": -15}', 3, 1),
  -- Cadjèhoun
  ('sport_seance', 'salle_sport_cadjehoun', 'Faire une séance de sport', '', 60, 1500, '{"fun": 20, "social": 5, "energy": -15, "hygiene": -20}', 3, 1),
  ('sport_douche', 'salle_sport_cadjehoun', 'Douche des vestiaires', '', 15, 300, '{"hygiene": 60}', 0, 2),
  -- Fidjrossè
  ('plage_balade', 'plage_fidjrosse', 'Se promener sur la plage', '', 60, 0, '{"fun": 25, "social": 10, "energy": -5}', 1, 1),
  ('plage_paillote', 'plage_fidjrosse', 'Se reposer sous une paillote', '', 60, 500, '{"energy": 20, "fun": 10}', 1, 2),
  ('vague_poisson', 'buvette_la_vague', 'Poisson grillé et alloco', '', 45, 2500, '{"hunger": 50, "social": 10, "fun": 5}', 1, 1),
  ('vague_toilettes', 'buvette_la_vague', 'Toilettes de la buvette', '', 10, 100, '{"bladder": 100}', 0, 2),
  -- Akpakpa
  ('carrefour_plat', 'maquis_carrefour', 'Manger un riz-sauce arachide', '', 30, 1200, '{"hunger": 40, "social": 5}', 1, 1),
  ('carrefour_toilettes', 'maquis_carrefour', 'Toilettes du maquis', '', 10, 100, '{"bladder": 100}', 0, 2),
  -- Agla
  ('auberge_nuit', 'auberge_la_paix', 'Dormir une nuit', '8 heures de sommeil.', 480, 5000, '{"energy": 100}', 1, 1),
  ('auberge_sieste', 'auberge_la_paix', 'Faire une sieste', '', 120, 2000, '{"energy": 30}', 0, 2),
  ('auberge_douche', 'auberge_la_paix', 'Prendre une douche', '', 15, 300, '{"hygiene": 70}', 0, 3),
  ('auberge_toilettes', 'auberge_la_paix', 'Utiliser les toilettes', '', 10, 0, '{"bladder": 100}', 0, 4),
  ('bon_coin_plat', 'maquis_bon_coin', 'Manger un plat d''amiwo au poulet', '', 30, 1200, '{"hunger": 40, "social": 5}', 1, 1),
  ('bon_coin_causer', 'maquis_bon_coin', 'Regarder le match avec les habitués', '', 90, 500, '{"fun": 25, "social": 25, "bladder": -10}', 2, 2),
  -- Gbégamey
  ('cine_film', 'cine_etoile', 'Regarder un film', '', 120, 2500, '{"fun": 45, "social": 5}', 2, 1),
  ('cine_toilettes', 'cine_etoile', 'Toilettes du cinéma', '', 10, 0, '{"bladder": 100}', 0, 2);

insert into public.transport_modes (code, name, icon, base_fare, fare_per_km, minutes_per_km, effects_per_km, sort) values
  ('marche', 'À pied', '🚶', 0, 0, 12, '{"energy": -3}', 1),
  ('zemidjan', 'Zémidjan (moto-taxi)', '🏍️', 100, 80, 3, '{}', 2),
  ('taxi_ville', 'Taxi-ville', '🚕', 150, 60, 4, '{}', 3),
  ('bus', 'Bus urbain', '🚌', 150, 20, 6, '{}', 4);

insert into public.jobs (code, building_code, name, name_feminine, description, tier, required_level, base_pay, shift_minutes, shift_start_hour, shift_end_hour, xp_per_shift, effects, sort) values
  ('vendeur_marche', 'marche_dantokpa', 'Vendeur au marché', 'Vendeuse au marché', 'Tenir l''étal de pagnes de Maman Bella.', 'debutant', 1, 3000, 120, 6, 19, 10, '{"energy": -12, "hygiene": -8, "social": 5}', 1),
  ('serveur', 'restaurant_baobab', 'Serveur', 'Serveuse', 'Prendre les commandes et servir en salle.', 'debutant', 1, 3500, 120, 11, 23, 10, '{"energy": -12, "hygiene": -6, "social": 5}', 2),
  ('agent_securite', 'bureaux_ganhi', 'Agent de sécurité', 'Agente de sécurité', 'Surveiller l''entrée de la tour d''affaires.', 'debutant', 1, 3500, 120, 6, 22, 10, '{"energy": -8, "fun": -6}', 3),
  ('caissier', 'supermarche_ganhi', 'Caissier', 'Caissière', 'Tenir une caisse du supermarché.', 'debutant', 1, 4000, 120, 8, 21, 10, '{"energy": -8, "fun": -4}', 4),
  ('livreur', 'express_livraison', 'Livreur à moto', 'Livreuse à moto', 'Livrer colis et repas dans toute la ville.', 'debutant', 1, 4000, 120, 7, 21, 10, '{"energy": -14, "hygiene": -8}', 5),
  ('macon', 'chantier_akpakpa', 'Maçon', 'Maçonne', 'Monter les murs du nouvel immeuble.', 'debutant', 1, 4000, 120, 6, 18, 10, '{"energy": -18, "hygiene": -15}', 6),
  ('mecanicien', 'garage_akpakpa', 'Mécanicien', 'Mécanicienne', 'Réparer motos et voitures.', 'debutant', 1, 4500, 120, 7, 19, 10, '{"energy": -14, "hygiene": -15}', 7),
  ('chauffeur_taxi', 'station_etoile_rouge', 'Chauffeur de taxi-ville', 'Chauffeuse de taxi-ville', 'Transporter les clients d''un quartier à l''autre.', 'debutant', 2, 5000, 120, 5, 22, 10, '{"energy": -10, "hygiene": -5, "social": 5}', 8),
  ('assistant_bureau', 'bureaux_ganhi', 'Assistant de bureau', 'Assistante de bureau', 'Accueil, agenda et dossiers d''une PME.', 'debutant', 2, 5000, 120, 8, 18, 10, '{"energy": -8, "fun": -5}', 9),
  ('electricien', 'chantier_akpakpa', 'Électricien', 'Électricienne', 'Câbler les appartements du chantier.', 'debutant', 3, 5500, 120, 7, 18, 10, '{"energy": -12, "hygiene": -8}', 10);

insert into public.appearance_options (category, code, label, sort) values
  ('skin', 'ebene', 'Ébène', 1), ('skin', 'acajou', 'Acajou', 2), ('skin', 'cacao', 'Cacao', 3),
  ('skin', 'caramel', 'Caramel', 4), ('skin', 'miel', 'Miel', 5), ('skin', 'sable', 'Sable', 6),
  ('face', 'ovale', 'Ovale', 1), ('face', 'rond', 'Rond', 2), ('face', 'carre', 'Carré', 3), ('face', 'long', 'Allongé', 4),
  ('hair', 'ras', 'Ras', 1), ('hair', 'degrade', 'Dégradé', 2), ('hair', 'afro', 'Afro', 3), ('hair', 'locks', 'Locks', 4),
  ('hair', 'tresses', 'Tresses', 5), ('hair', 'bantu', 'Bantu knots', 6), ('hair', 'chignon', 'Chignon', 7), ('hair', 'foulard', 'Foulard (gèlè)', 8),
  ('outfit', 'tshirt_jean', 'T-shirt et jean', 1), ('outfit', 'chemise_wax', 'Chemise en wax', 2), ('outfit', 'boubou', 'Boubou', 3),
  ('outfit', 'robe_wax', 'Robe en wax', 4), ('outfit', 'ensemble_pagne', 'Ensemble pagne', 5), ('outfit', 'costume', 'Costume', 6),
  ('outfit', 'maillot', 'Maillot de foot', 7),
  ('outfit_color', 'indigo', 'Indigo', 1), ('outfit_color', 'terracotta', 'Terracotta', 2), ('outfit_color', 'ocre', 'Ocre', 3),
  ('outfit_color', 'vert', 'Vert', 4), ('outfit_color', 'bordeaux', 'Bordeaux', 5), ('outfit_color', 'noir', 'Noir', 6), ('outfit_color', 'blanc', 'Blanc', 7),
  ('shoes', 'sandales', 'Sandales', 1), ('shoes', 'baskets', 'Baskets', 2), ('shoes', 'mocassins', 'Mocassins', 3), ('shoes', 'claquettes', 'Claquettes', 4),
  ('accessory', 'aucun', 'Aucun', 1), ('accessory', 'lunettes', 'Lunettes', 2), ('accessory', 'casquette', 'Casquette', 3),
  ('accessory', 'montre', 'Montre', 4), ('accessory', 'chaine', 'Chaîne', 5), ('accessory', 'boucles', 'Boucles d''oreilles', 6);
