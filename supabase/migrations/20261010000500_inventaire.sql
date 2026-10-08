-- =============================================================================
-- Phase A2 — Inventaire et boutiques (CdC V1 §14, §18, §19 ; V2 §49, §52 P1).
--   Produit → prix → stock → achat → inventaire.
--   Nourriture à consommer partout, ingrédients pour cuisiner chez soi,
--   meubles qui débloquent des activités à domicile, téléphones, vêtements
--   qui enrichissent la garde-robe.
-- =============================================================================

alter table public.buildings drop constraint buildings_kind_check;
alter table public.buildings add constraint buildings_kind_check check (kind in (
  'marche', 'maquis', 'restaurant', 'bar', 'toilettes', 'hebergement', 'bureaux', 'supermarche', 'plage', 'sport',
  'cinema', 'garage', 'chantier', 'transport', 'livraison', 'agence', 'boutique'));

alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in (
  'starting_cash', 'activity', 'travel', 'salary', 'mission', 'admin',
  'rent', 'upkeep', 'deposit', 'deposit_refund', 'arrears', 'home_purchase', 'home_sale', 'purchase'));

-- Options de départ (création du personnage) ou à acheter en boutique.
alter table public.appearance_options add column is_starter boolean not null default true;

create table public.items (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  category text not null check (category in ('nourriture', 'ingredient', 'vetement', 'meuble', 'telephone')),
  icon text not null,
  description text not null default '',
  -- Consommable : durée de consommation (minutes de jeu) et effets.
  use_minutes integer check (use_minutes between 5 and 120),
  effects jsonb not null default '{}' check (_valid_needs_object(effects)),
  -- Vêtement : option d'apparence débloquée.
  appearance_category text,
  appearance_code text,
  max_stack integer not null default 20 check (max_stack between 1 and 99),
  is_active boolean not null default true,
  sort integer not null default 0,
  foreign key (appearance_category, appearance_code) references public.appearance_options (category, code),
  check ((category = 'vetement') = (appearance_code is not null)),
  check (category <> 'nourriture' or use_minutes is not null)
);

-- Ce que vend chaque boutique ; stock remis au maximum chaque jour de jeu.
create table public.shop_items (
  building_code text not null references public.buildings (code),
  item_code text not null references public.items (code),
  price bigint not null check (price > 0),
  stock_max integer not null check (stock_max > 0),
  stock integer not null check (stock >= 0),
  restocked_day bigint not null default 0,
  primary key (building_code, item_code)
);

create table public.inventory (
  character_id uuid not null references public.characters (id) on delete cascade,
  item_code text not null references public.items (code),
  quantity integer not null check (quantity > 0),
  acquired_at timestamptz not null default now(),
  primary key (character_id, item_code)
);

-- Objets requis (l'un d'eux suffit) pour une activité ; objets qui débloquent une activité à domicile.
alter table public.activities add column required_items text[];
alter table public.home_activities
  add column required_items text[],
  add column consumes_item text references public.items (code);

do $$
declare t text;
begin
  foreach t in array array['items', 'shop_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_lecture', t);
  end loop;
end $$;
alter table public.inventory enable row level security;
revoke all on public.inventory from anon, authenticated;
grant select on public.inventory to authenticated;
create policy inventory_proprietaire on public.inventory for select to authenticated
  using (character_id in (select id from public.characters where user_id = (select auth.uid())));

-- -----------------------------------------------------------------------------
-- Moteur
-- -----------------------------------------------------------------------------

create function public._has_any_item(p_character uuid, p_items text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from inventory where character_id = p_character and item_code = any (p_items));
$$;

create function public._item_names(p_items text[]) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select string_agg(name, ' ou ' order by sort) from items where code = any (p_items);
$$;

create function public._give_item(p_character uuid, p_item text, p_qty integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_max integer; v_now integer;
begin
  select max_stack into v_max from items where code = p_item;
  select coalesce(sum(quantity), 0) into v_now from inventory where character_id = p_character and item_code = p_item;
  if v_now + p_qty > v_max then
    perform _fail('inventory_full', format('Vous ne pouvez pas porter plus de %s × %s.', v_max, (select name from items where code = p_item)));
  end if;
  insert into inventory (character_id, item_code, quantity) values (p_character, p_item, p_qty)
  on conflict (character_id, item_code) do update set quantity = inventory.quantity + excluded.quantity;
end $$;

create function public._take_item(p_character uuid, p_item text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update inventory set quantity = quantity - 1 where character_id = p_character and item_code = p_item and quantity > 1;
  if not found then
    delete from inventory where character_id = p_character and item_code = p_item;
    if not found then
      perform _fail('missing_item', format('Vous n''avez pas de %s.', coalesce((select name from items where code = p_item), p_item)));
    end if;
  end if;
end $$;

-- Objets de départ de tout nouveau personnage.
create function public._starter_items() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into inventory (character_id, item_code, quantity) values (new.id, 'telephone_basique', 1);
  return new;
end $$;

-- La création du personnage n'accepte que les options de départ (les autres s'achètent).
create function public._check_starter_look() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from jsonb_each_text(new.appearance) e
    join appearance_options o on o.category = e.key and o.code = e.value
    where not o.is_starter
  ) then
    perform _fail('invalid_appearance', 'Cette tenue s''achète en boutique : choisissez une option de départ.');
  end if;
  return new;
end $$;

-- État des modules ajoutés après le cœur du jeu (remplacé à chaque nouveau module).
create function public._state_modules(p_character uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'inventory', coalesce((
      select jsonb_agg(jsonb_build_object('code', i.item_code, 'quantity', i.quantity) order by it.sort)
      from inventory i join items it on it.code = i.item_code
      where i.character_id = p_character
    ), '[]'::jsonb)
  );
$$;

-- _state = cœur (personnage, emploi, logement) + modules.
alter function public._state(uuid) rename to _state_core;
create function public._state(p_character uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select _state_core(p_character) || _state_modules(p_character);
$$;

-- Activité dans un lieu (version 2) : objets requis en plus des règles d'origine.
create or replace function public.start_activity(p_code text) returns jsonb
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
  if v.required_items is not null and not _has_any_item(v_id, v.required_items) then
    perform _fail('missing_item', format('Il vous faut : %s.', _item_names(v.required_items)));
  end if;

  perform _money(v_id, -v.price, 'activity', v.code);
  update characters set
    activity = jsonb_build_object('kind', 'activity', 'code', v.code, 'label', v.name, 'effects', v.effects, 'xp', v.xp, 'cost', v.price),
    activity_started_at = now(),
    activity_ends_at = now() + real_duration(v.duration_minutes)
  where id = v_id;
  return _state(v_id);
end $$;

-- Activité à domicile (version 2) : un meuble peut remplacer le confort requis ; certaines consomment un objet.
create or replace function public.start_home_activity(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  c characters;
  v home_activities;
  h record;
  v_unlocked boolean;
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
  v_unlocked := _effective_comfort(h.comfort, h.arrears) >= v.min_comfort
    or (v.required_items is not null and _has_any_item(v_id, v.required_items));
  if not v_unlocked then
    perform _fail('comfort_too_low', case
      when h.arrears > 0 then 'Coupure en cours : réglez vos arriérés pour retrouver tout le confort de votre logement.'
      when v.required_items is not null then format('Il faut un logement plus confortable (confort %s) ou : %s.', v.min_comfort, _item_names(v.required_items))
      else format('Votre logement n''est pas assez équipé (confort %s requis).', v.min_comfort) end);
  end if;
  if v.consumes_item is not null then
    perform _take_item(v_id, v.consumes_item);
  end if;

  perform _money(v_id, -v.price, 'activity', v.code);
  update characters set
    activity = jsonb_build_object('kind', 'activity', 'code', v.code, 'label', v.name, 'effects', v.effects, 'xp', v.xp, 'cost', v.price),
    activity_started_at = now(),
    activity_ends_at = now() + real_duration(v.duration_minutes)
  where id = v_id;
  return _state(v_id);
end $$;

-- Acheter en boutique (sur place, boutique ouverte, stock du jour).
create function public.buy_item(p_building text, p_item text, p_quantity integer default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  c characters;
  b record;
  s shop_items;
  v_item items;
  v_day bigint := game_minute(now()) / 1440;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  select * into c from characters where id = v_id;
  if p_quantity is null or p_quantity not between 1 and 20 then
    perform _fail('invalid_quantity', 'Quantité invalide (1 à 20).');
  end if;
  select bu.*, d.name as district_name into b from buildings bu join districts d on d.code = bu.district_code where bu.code = p_building;
  if not found then
    perform _fail('unknown_shop', 'Cette boutique n''existe pas.');
  end if;
  select * into s from shop_items where building_code = p_building and item_code = p_item for update;
  select * into v_item from items where code = p_item and is_active;
  if s.item_code is null or v_item.code is null then
    perform _fail('not_sold_here', format('%s ne vend pas cet article.', b.name));
  end if;
  if b.district_code <> c.district_code then
    perform _fail('wrong_place', format('Rendez-vous d''abord à %s (%s).', b.name, b.district_name));
  end if;
  if not building_is_open(b.open_hour, b.close_hour, game_minute(now())) then
    perform _fail('closed', format('%s est fermé à cette heure (ouvert de %sh à %sh).', b.name, b.open_hour, b.close_hour % 24));
  end if;
  if s.restocked_day < v_day then
    s.stock := s.stock_max;
  end if;
  if s.stock < p_quantity then
    perform _fail('out_of_stock', format('Stock insuffisant : il reste %s × %s aujourd''hui.', s.stock, v_item.name));
  end if;

  perform _money(v_id, -(s.price * p_quantity), 'purchase', v_item.code);
  perform _give_item(v_id, v_item.code, p_quantity);
  update shop_items set stock = s.stock - p_quantity, restocked_day = v_day where building_code = p_building and item_code = p_item;
  return _state(v_id);
end $$;

-- Consommer un objet de son sac (nourriture), où que l'on soit.
create function public.use_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  v_item items;
begin
  perform _settle(v_id);
  perform _ensure_free(v_id);
  select * into v_item from items where code = p_item;
  if not found or v_item.use_minutes is null then
    perform _fail('not_usable', 'Cet objet ne se consomme pas.');
  end if;
  perform _take_item(v_id, v_item.code);
  update characters set
    activity = jsonb_build_object('kind', 'activity', 'code', v_item.code, 'label', format('Consommer : %s', v_item.name),
      'effects', v_item.effects, 'xp', 0, 'cost', 0),
    activity_started_at = now(),
    activity_ends_at = now() + real_duration(v_item.use_minutes)
  where id = v_id;
  return _state(v_id);
end $$;

-- Garde-robe : changer une option d'apparence (les options achetées doivent être possédées).
create function public.change_look(p_category text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := _lock_my_character();
  o appearance_options;
begin
  select * into o from appearance_options where category = p_category and code = p_code;
  if not found then
    perform _fail('invalid_appearance', 'Option d''apparence inconnue.');
  end if;
  if not o.is_starter and not exists (
    select 1 from inventory i join items it on it.code = i.item_code
    where i.character_id = v_id and it.appearance_category = o.category and it.appearance_code = o.code
  ) then
    perform _fail('missing_item', format('Achetez d''abord « %s » en boutique.', o.label));
  end if;
  update characters set appearance = jsonb_set(appearance, array[o.category], to_jsonb(o.code)) where id = v_id;
  return _state(v_id);
end $$;

-- -----------------------------------------------------------------------------
-- Données
-- -----------------------------------------------------------------------------

insert into public.appearance_options (category, code, label, sort, is_starter) values
  ('outfit', 'basin_brode', 'Basin brodé', 8, false),
  ('accessory', 'chapeau', 'Chapeau panama', 7, false);

insert into public.buildings (code, district_code, name, kind, description, open_hour, close_hour, sort) values
  ('galerie_tech', 'gbegamey', 'Galerie Tech de l''Étoile Rouge', 'boutique', 'Téléphones, télévisions, consoles.', 9, 20, 4),
  ('couture_haie_vive', 'haie_vive', 'Maison Couture Haie Vive', 'boutique', 'Basin, wax et accessoires de créateurs.', 9, 20, 3);

insert into public.items (code, name, category, icon, description, use_minutes, effects, appearance_category, appearance_code, max_stack, sort) values
  ('beignets', 'Beignets', 'nourriture', '🍩', 'Des beignets chauds du marché.', 10, '{"hunger": 15}', null, null, 20, 1),
  ('gari_arachide', 'Gari et arachides', 'nourriture', '🥜', 'Le classique qui tient au corps.', 10, '{"hunger": 20}', null, null, 20, 2),
  ('fruits', 'Ananas et mangues', 'nourriture', '🍍', 'Fruits frais coupés.', 10, '{"hunger": 10, "fun": 3}', null, null, 20, 3),
  ('sandwich', 'Sandwich', 'nourriture', '🥪', 'Pain, omelette, crudités.', 15, '{"hunger": 30}', null, null, 10, 4),
  ('sucrerie', 'Sucrerie', 'nourriture', '🥤', 'Une boisson sucrée bien fraîche.', 5, '{"fun": 5, "bladder": -5}', null, null, 20, 5),
  ('ingredients', 'Panier d''ingrédients', 'ingredient', '🧺', 'De quoi cuisiner un repas à la maison.', null, '{}', null, null, 20, 6),
  ('telephone_basique', 'Téléphone basique', 'telephone', '📱', 'Pour appeler et envoyer des SMS.', null, '{}', null, null, 1, 7),
  ('smartphone', 'Smartphone', 'telephone', '📲', 'Vidéos, réseaux sociaux, et bientôt WA Social.', null, '{}', null, null, 1, 8),
  ('rechaud', 'Réchaud à gaz', 'meuble', '🔥', 'Permet de cuisiner même dans une chambre.', null, '{}', null, null, 1, 9),
  ('ventilateur', 'Ventilateur', 'meuble', '🌀', 'Pour se reposer au frais.', null, '{}', null, null, 1, 10),
  ('television', 'Télévision', 'meuble', '📺', 'Matchs, séries et informations.', null, '{}', null, null, 1, 11),
  ('climatiseur', 'Climatiseur', 'meuble', '❄️', 'Des nuits fraîches et réparatrices.', null, '{}', null, null, 1, 12),
  ('console', 'Console de jeux', 'meuble', '🎮', 'FIFA entre amis.', null, '{}', null, null, 1, 13),
  ('basin_brode', 'Basin brodé', 'vetement', '👘', 'Grand boubou en basin riche, broderies dorées.', null, '{}', 'outfit', 'basin_brode', 1, 14),
  ('chapeau', 'Chapeau panama', 'vetement', '👒', 'Élégant et léger.', null, '{}', 'accessory', 'chapeau', 1, 15);

insert into public.shop_items (building_code, item_code, price, stock_max, stock) values
  ('marche_dantokpa', 'beignets', 300, 80, 80),
  ('marche_dantokpa', 'gari_arachide', 250, 80, 80),
  ('marche_dantokpa', 'fruits', 500, 60, 60),
  ('marche_dantokpa', 'ingredients', 600, 60, 60),
  ('marche_dantokpa', 'telephone_basique', 7500, 10, 10),
  ('marche_dantokpa', 'rechaud', 15000, 8, 8),
  ('marche_dantokpa', 'ventilateur', 12000, 8, 8),
  ('marche_dantokpa', 'basin_brode', 42000, 6, 6),
  ('maquis_bon_coin', 'beignets', 350, 30, 30),
  ('maquis_bon_coin', 'sucrerie', 400, 30, 30),
  ('supermarche_ganhi', 'sandwich', 1500, 40, 40),
  ('supermarche_ganhi', 'sucrerie', 400, 60, 60),
  ('supermarche_ganhi', 'fruits', 600, 40, 40),
  ('supermarche_ganhi', 'ingredients', 700, 40, 40),
  ('supermarche_ganhi', 'television', 120000, 4, 4),
  ('supermarche_ganhi', 'climatiseur', 250000, 3, 3),
  ('galerie_tech', 'telephone_basique', 8000, 10, 10),
  ('galerie_tech', 'smartphone', 85000, 6, 6),
  ('galerie_tech', 'television', 115000, 4, 4),
  ('galerie_tech', 'console', 180000, 3, 3),
  ('couture_haie_vive', 'basin_brode', 48000, 6, 6),
  ('couture_haie_vive', 'chapeau', 9000, 10, 10);

-- Le téléphone sert à appeler ; le smartphone ouvre les vidéos.
update public.activities set required_items = array['telephone_basique', 'smartphone'] where code = 'appeler_famille';
insert into public.activities (code, building_code, name, description, duration_minutes, price, effects, xp, required_items, sort) values
  ('regarder_videos', null, 'Regarder des vidéos sur son smartphone', '', 30, 0, '{"fun": 15, "social": 5}', 0, array['smartphone'], 2);

-- Cuisiner consomme un panier d'ingrédients ; le réchaud le permet dès la chambre.
update public.home_activities set price = 0, consumes_item = 'ingredients', required_items = array['rechaud'],
  description = 'Consomme un panier d''ingrédients.' where code = 'maison_cuisiner';
update public.home_activities set required_items = array['television'] where code = 'maison_tele';
insert into public.home_activities (code, name, description, min_comfort, duration_minutes, price, effects, xp, required_items, sort) values
  ('maison_frais', 'Se reposer au frais', '', 3, 60, 0, '{"energy": 20, "fun": 5}', 0, array['ventilateur', 'climatiseur'], 10),
  ('maison_dormir_clim', 'Dormir climatisé', '8 heures de sommeil au frais.', 4, 480, 0, '{"energy": 100, "fun": 10, "hygiene": 5}', 1, array['climatiseur'], 11),
  ('maison_jeux_video', 'Jouer à la console', '', 5, 60, 0, '{"fun": 35, "social": 5}', 0, array['console'], 12);

-- Objets de départ (nouveaux et anciens personnages).
create trigger characters_starter_items after insert on public.characters for each row execute function public._starter_items();
create trigger characters_starter_look before insert on public.characters for each row execute function public._check_starter_look();
insert into public.inventory (character_id, item_code, quantity)
select id, 'telephone_basique', 1 from public.characters on conflict do nothing;

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
  public.mark_notifications_read(),
  public.buy_item(text, text, integer),
  public.use_item(text),
  public.change_look(text, text)
to authenticated;
