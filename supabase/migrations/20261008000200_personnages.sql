-- =============================================================================
-- Étapes 3, 5, 7, 8 — Personnages, carrière, grand livre de l'argent, journal.
-- Lecture : le propriétaire uniquement. Écriture : fonctions du moteur uniquement.
-- =============================================================================

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 30),
  pseudo text not null check (pseudo ~ '^[A-Za-z0-9_.-]{3,20}$'),
  gender text not null check (gender in ('homme', 'femme')),
  age integer not null check (age between 18 and 60),
  appearance jsonb not null,
  country_code text not null references public.countries (code),
  city_code text not null references public.cities (code),
  district_code text not null references public.districts (code),
  cash bigint not null default 0 check (cash >= 0),
  xp bigint not null default 0 check (xp >= 0),
  -- Besoins (0 = critique, 100 = satisfait).
  hunger double precision not null check (hunger between 0 and 100),
  energy double precision not null check (energy between 0 and 100),
  hygiene double precision not null check (hygiene between 0 and 100),
  fun double precision not null check (fun between 0 and 100),
  social double precision not null check (social between 0 and 100),
  bladder double precision not null check (bladder between 0 and 100),
  needs_updated_at timestamptz not null default now(),
  -- Action en cours : instantané figé au lancement (effets, gain, XP, destination).
  activity jsonb,
  activity_started_at timestamptz,
  activity_ends_at timestamptz,
  created_at timestamptz not null default now(),
  check ((activity is null) = (activity_ends_at is null))
);
create unique index characters_pseudo_unique on public.characters (lower(pseudo));

create table public.character_jobs (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  job_code text not null references public.jobs (code),
  xp integer not null default 0 check (xp >= 0),
  shifts integer not null default 0 check (shifts >= 0),
  is_active boolean not null default true,
  hired_at timestamptz not null default now(),
  left_at timestamptz,
  unique (character_id, job_code)
);
-- Un seul emploi actif à la fois.
create unique index character_jobs_one_active on public.character_jobs (character_id) where is_active;

-- Grand livre : chaque franc virtuel gagné ou dépensé.
create table public.transactions (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  kind text not null check (kind in ('starting_cash', 'activity', 'travel', 'salary', 'mission', 'admin')),
  ref text,
  created_at timestamptz not null default now()
);
create index transactions_character_idx on public.transactions (character_id, created_at desc);

-- Historique des actions terminées (analytics, anti-triche).
create table public.activity_log (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  kind text not null check (kind in ('activity', 'travel', 'work')),
  code text not null,
  label text not null,
  district_code text,
  cost bigint not null default 0,
  earned bigint not null default 0,
  xp integer not null default 0,
  started_at timestamptz not null,
  ended_at timestamptz not null
);
create index activity_log_character_idx on public.activity_log (character_id, ended_at desc);

do $$
declare t text;
begin
  foreach t in array array['characters', 'character_jobs', 'transactions', 'activity_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create policy characters_proprietaire on public.characters for select to authenticated
  using (user_id = (select auth.uid()));
create policy character_jobs_proprietaire on public.character_jobs for select to authenticated
  using (character_id in (select id from public.characters where user_id = (select auth.uid())));
create policy transactions_proprietaire on public.transactions for select to authenticated
  using (character_id in (select id from public.characters where user_id = (select auth.uid())));
create policy activity_log_proprietaire on public.activity_log for select to authenticated
  using (character_id in (select id from public.characters where user_id = (select auth.uid())));
