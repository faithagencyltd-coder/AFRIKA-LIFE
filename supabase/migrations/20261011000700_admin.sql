-- =============================================================================
-- Phase A4 — Administration (CdC V1 §39-40 ; V2 §42-43).
--   Rôles admin / modérateur, sanctions (suspension, bannissement), ajustement
--   d'argent tracé, modification des prix, journal d'audit, tableau de bord
--   économique (argent créé / détruit, circulation, métiers, objets).
--   Premier administrateur : voir README « Administration ».
-- =============================================================================

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'moderateur')),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_user uuid not null,
  action text not null,
  target text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

alter table public.characters
  add column sanction text check (sanction in ('suspendu', 'banni')),
  add column sanction_until timestamptz,
  add column sanction_reason text;

-- -----------------------------------------------------------------------------
-- Contrôles
-- -----------------------------------------------------------------------------

create function public.admin_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from admins where user_id = auth.uid();
$$;

-- p_role = 'moderateur' : modérateurs et admins ; 'admin' : admins seulement.
create function public._require_admin(p_role text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_role text := admin_role();
begin
  if v_role is null or (p_role = 'admin' and v_role <> 'admin') then
    perform _fail('forbidden', 'Accès réservé à l''administration.');
  end if;
end $$;

create function public._audit(p_action text, p_target text, p_details jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into admin_audit (admin_user, action, target, details) values (auth.uid(), p_action, p_target, p_details);
$$;

-- Un joueur sanctionné ne peut plus agir (les lectures restent possibles pour afficher le motif).
create or replace function public._lock_my_character() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare c record;
begin
  if auth.uid() is null then
    perform _fail('not_authenticated', 'Connectez-vous pour jouer.');
  end if;
  select id, sanction, sanction_until, sanction_reason into c from characters where user_id = auth.uid() for update;
  if c.id is null then
    perform _fail('no_character', 'Créez d''abord votre personnage.');
  end if;
  if c.sanction = 'banni' then
    perform _fail('sanctioned', format('Compte banni : %s', coalesce(c.sanction_reason, 'non-respect des règles.')));
  end if;
  if c.sanction = 'suspendu' and (c.sanction_until is null or c.sanction_until > now()) then
    perform _fail('sanctioned', format('Compte suspendu%s : %s',
      case when c.sanction_until is not null then ' jusqu''au ' || to_char(c.sanction_until at time zone 'UTC', 'DD/MM/YYYY HH24:MI') || ' (UTC)' else '' end,
      coalesce(c.sanction_reason, 'non-respect des règles.')));
  end if;
  return c.id;
end $$;

-- -----------------------------------------------------------------------------
-- Tableau de bord économique (§43)
-- -----------------------------------------------------------------------------

create function public.admin_economy() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_circulation numeric;
  v_net_24h numeric;
begin
  perform _require_admin('moderateur');
  select coalesce(sum(cash), 0) into v_circulation from characters;
  select coalesce(sum(amount), 0) into v_net_24h from transactions where created_at > now() - interval '24 hours';
  return jsonb_build_object(
    'generated_at', now(),
    'players', jsonb_build_object(
      'total', (select count(*) from characters),
      'new_7d', (select count(*) from characters where created_at > now() - interval '7 days'),
      'active_24h', (select count(distinct character_id) from activity_log where ended_at > now() - interval '24 hours'),
      'active_7d', (select count(distinct character_id) from activity_log where ended_at > now() - interval '7 days'),
      'sanctioned', (select count(*) from characters where sanction is not null)
    ),
    'money', jsonb_build_object(
      'circulation', v_circulation,
      'average_cash', (select coalesce(round(avg(cash)), 0) from characters),
      'median_cash', (select coalesce(percentile_disc(0.5) within group (order by cash), 0) from characters),
      'net_24h', v_net_24h,
      -- Croissance de la masse monétaire sur 24 h (indicateur d'inflation).
      'growth_24h_pct', case when v_circulation - v_net_24h > 0 then round(v_net_24h * 100.0 / (v_circulation - v_net_24h), 2) else null end
    ),
    -- Argent créé (sources) et détruit (puits) par nature, sur 7 jours et depuis le début.
    'flows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', kind,
        'created_7d', created_7d, 'destroyed_7d', destroyed_7d,
        'created_all', created_all, 'destroyed_all', destroyed_all
      ) order by created_all + destroyed_all desc)
      from (
        select kind,
          coalesce(sum(amount) filter (where amount > 0 and created_at > now() - interval '7 days'), 0) as created_7d,
          coalesce(-sum(amount) filter (where amount < 0 and created_at > now() - interval '7 days'), 0) as destroyed_7d,
          coalesce(sum(amount) filter (where amount > 0), 0) as created_all,
          coalesce(-sum(amount) filter (where amount < 0), 0) as destroyed_all
        from transactions group by kind
      ) f
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'created', created, 'destroyed', destroyed) order by d)
      from (
        select date_trunc('day', created_at)::date as d,
          coalesce(sum(amount) filter (where amount > 0 and kind <> 'starting_cash'), 0) as created,
          coalesce(-sum(amount) filter (where amount < 0), 0) as destroyed
        from transactions where created_at > now() - interval '7 days'
        group by 1
      ) x
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object('code', j.code, 'name', j.name, 'workers', w.workers, 'shifts', w.shifts,
        'salaries', coalesce(p.paid, 0), 'avg_pay', case when w.shifts > 0 then round(coalesce(p.paid, 0)::numeric / greatest(p.n, 1)) end)
        order by coalesce(p.paid, 0) desc, j.sort)
      from jobs j
      left join (select job_code, count(*) filter (where is_active) as workers, sum(shifts) as shifts from character_jobs group by job_code) w on w.job_code = j.code
      left join (select ref, sum(amount) as paid, count(*) as n from transactions where kind = 'salary' group by ref) p on p.ref = j.code
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('code', i.code, 'name', i.name, 'icon', i.icon, 'purchases', s.n, 'revenue', s.total) order by s.total desc)
      from (select ref, count(*) as n, -sum(amount) as total from transactions where kind = 'purchase' group by ref) s
      join items i on i.code = s.ref
    ), '[]'::jsonb),
    'homes', coalesce((
      select jsonb_agg(jsonb_build_object('code', h.code, 'name', h.name, 'occupied', o.n) order by o.n desc)
      from (select home_code, count(*) as n from character_homes where is_active group by home_code) o
      join homes h on h.code = o.home_code
    ), '[]'::jsonb),
    'richest', coalesce((
      select jsonb_agg(jsonb_build_object('pseudo', pseudo, 'cash', cash, 'level', player_level(xp)) order by cash desc)
      from (select pseudo, cash, xp from characters order by cash desc limit 5) r
    ), '[]'::jsonb)
  );
end $$;

-- -----------------------------------------------------------------------------
-- Joueurs et sanctions
-- -----------------------------------------------------------------------------

create function public.admin_players(p_search text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin('moderateur');
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select c.id, c.pseudo, c.first_name, player_level(c.xp) as level, c.cash, c.city_code, c.district_code, c.created_at,
        c.sanction, c.sanction_until, c.sanction_reason,
        (c.sanction = 'banni' or (c.sanction = 'suspendu' and (c.sanction_until is null or c.sanction_until > now()))) as sanction_active,
        (select max(ended_at) from activity_log l where l.character_id = c.id) as last_activity,
        (select email from auth.users u where u.id = c.user_id) as email
      from characters c
      where p_search is null or p_search = ''
         or c.pseudo ilike '%' || p_search || '%' or c.first_name ilike '%' || p_search || '%'
      order by c.created_at desc
      limit 100
    ) x
  ), '[]'::jsonb);
end $$;

-- p_kind null : lever la sanction. p_hours null : sans limite de durée.
create function public.admin_sanction(p_character uuid, p_kind text, p_hours integer, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin('moderateur');
  if p_kind is not null and p_kind not in ('suspendu', 'banni') then
    perform _fail('invalid_sanction', 'Sanction inconnue.');
  end if;
  if p_kind = 'banni' then
    perform _require_admin('admin');
  end if;
  if p_kind is not null and coalesce(btrim(p_reason), '') = '' then
    perform _fail('reason_required', 'Indiquez le motif de la sanction.');
  end if;
  update characters set
    sanction = p_kind,
    sanction_until = case when p_kind is null or p_hours is null then null else now() + make_interval(hours => p_hours) end,
    sanction_reason = case when p_kind is null then null else btrim(p_reason) end
  where id = p_character;
  if not found then
    perform _fail('unknown_character', 'Joueur introuvable.');
  end if;
  perform _audit(coalesce('sanction_' || p_kind, 'sanction_levee'), p_character::text, jsonb_build_object('hours', p_hours, 'reason', p_reason));
end $$;

-- Ajustement d'argent (admin seulement), toujours tracé dans le grand livre et l'audit.
create function public.admin_adjust_cash(p_character uuid, p_amount bigint, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin('admin');
  if coalesce(btrim(p_reason), '') = '' then
    perform _fail('reason_required', 'Indiquez le motif de l''ajustement.');
  end if;
  if p_amount = 0 or abs(p_amount) > 100000000 then
    perform _fail('invalid_amount', 'Montant invalide (non nul, 100 000 000 FCFA au plus).');
  end if;
  if not exists (select 1 from characters where id = p_character) then
    perform _fail('unknown_character', 'Joueur introuvable.');
  end if;
  perform _money(p_character, p_amount, 'admin', left(btrim(p_reason), 60));
  perform _audit('ajustement_argent', p_character::text, jsonb_build_object('amount', p_amount, 'reason', p_reason));
end $$;

-- -----------------------------------------------------------------------------
-- Prix (§39 « modifier les prix ») — les actions déjà payées ne changent pas (instantanés).
-- -----------------------------------------------------------------------------

create function public.admin_prices() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin('moderateur');
  return jsonb_build_object(
    'activities', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'value', price) order by building_code nulls first, sort) from activities),
    'shop', (select jsonb_agg(jsonb_build_object('code', s.building_code || ':' || s.item_code, 'name', i.name || ' · ' || b.name, 'value', s.price) order by b.name, i.sort)
             from shop_items s join items i on i.code = s.item_code join buildings b on b.code = s.building_code),
    'rents', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'value', rent_per_week) order by sort) from homes),
    'jobs', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'value', base_pay) order by sort) from jobs)
  );
end $$;

create function public.admin_set_price(p_kind text, p_code text, p_value bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old bigint;
begin
  perform _require_admin('admin');
  if p_value is null or p_value < 0 or p_value > 1000000000 or (p_kind <> 'activities' and p_value = 0) then
    perform _fail('invalid_amount', 'Montant invalide.');
  end if;
  case p_kind
    when 'activities' then
      select price into v_old from activities where code = p_code;
      update activities set price = p_value where code = p_code;
    when 'shop' then
      select price into v_old from shop_items where building_code = split_part(p_code, ':', 1) and item_code = split_part(p_code, ':', 2);
      update shop_items set price = p_value where building_code = split_part(p_code, ':', 1) and item_code = split_part(p_code, ':', 2);
    when 'rents' then
      select rent_per_week into v_old from homes where code = p_code;
      update homes set rent_per_week = p_value where code = p_code;
    when 'jobs' then
      select base_pay into v_old from jobs where code = p_code;
      update jobs set base_pay = p_value where code = p_code;
    else
      perform _fail('invalid_kind', 'Catégorie de prix inconnue.');
  end case;
  if v_old is null then
    perform _fail('unknown_code', 'Élément introuvable.');
  end if;
  perform _audit('prix', p_kind || ':' || p_code, jsonb_build_object('old', v_old, 'new', p_value));
end $$;

create function public.admin_audit_log() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _require_admin('moderateur');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'target', a.target, 'details', a.details, 'created_at', a.created_at,
      'admin', (select email from auth.users u where u.id = a.admin_user)) order by a.id desc)
    from (select * from admin_audit order by id desc limit 100) a
  ), '[]'::jsonb);
end $$;

-- L'état du joueur affiche une éventuelle sanction.
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
    )
  );
$$;

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
  public.drop_goal(text),
  -- Administration : chaque fonction vérifie le rôle (admin_role() renvoie null pour un joueur).
  public.admin_role(),
  public.admin_economy(),
  public.admin_players(text),
  public.admin_sanction(uuid, text, integer, text),
  public.admin_adjust_cash(uuid, bigint, text),
  public.admin_prices(),
  public.admin_set_price(text, text, bigint),
  public.admin_audit_log()
to authenticated;
