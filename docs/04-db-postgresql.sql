create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists auth.refresh_tokens (
  id bigserial primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists auth.sessions (
  id bigserial primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists auth.identities (
  id bigserial primary key,
  user_id uuid not null,
  provider text not null default 'email',
  identity_data jsonb not null default '{}'::jsonb
);

create table if not exists auth.mfa_factors (
  id bigserial primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists auth.mfa_challenges (
  id bigserial primary key,
  factor_id bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  role text not null default 'socio',
  full_name text,
  sex text default 'O',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_phone_10_digits_chk
  check (phone ~ '^[0-9]{10}$');

alter table public.profiles
  add constraint profiles_role_chk
  check (role in ('admin','socio'));

alter table public.profiles
  add constraint profiles_sex_chk
  check (sex in ('F','M','O'));

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_is_active_idx on public.profiles(is_active);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_phone text;
  v_role text;
  v_full_name text;
  v_sex text;
  v_try int := 0;
begin
  v_phone := coalesce(
    nullif(new.raw_user_meta_data->>'phone',''),
    (regexp_match(coalesce(new.email,''), '^([0-9]{10})@'))[1]
  );

  v_role := coalesce(nullif(new.raw_user_meta_data->>'role',''), 'socio');
  if v_role not in ('admin','socio') then
    v_role := 'socio';
  end if;

  v_full_name := nullif(new.raw_user_meta_data->>'full_name','');
  v_sex := coalesce(nullif(new.raw_user_meta_data->>'sex',''), 'O');
  if v_sex not in ('F','M','O') then
    v_sex := 'O';
  end if;

  if v_phone is null or v_phone !~ '^[0-9]{10}$' then
    v_phone := lpad(floor(random()*10000000000)::bigint::text, 10, '0');
  end if;

  loop
    begin
      insert into public.profiles (user_id, phone, role, full_name, sex, is_active)
      values (new.id, v_phone, v_role, v_full_name, v_sex, true)
      on conflict (user_id) do update
        set phone = excluded.phone,
            role = excluded.role,
            full_name = coalesce(excluded.full_name, public.profiles.full_name),
            sex = coalesce(excluded.sex, public.profiles.sex);
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 10 then
        raise;
      end if;
      v_phone := lpad(floor(random()*10000000000)::bigint::text, 10, '0');
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin
on public.profiles for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_admin_only on public.profiles;
create policy profiles_insert_admin_only
on public.profiles for insert
to authenticated
with check (public.is_admin());

create table if not exists public.natilleras (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  periodicity text not null default 'mensual',
  contribution_amount numeric not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.natillera_members (
  natillera_id uuid not null references public.natilleras(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (natillera_id, user_id)
);

alter table public.natilleras enable row level security;
alter table public.natillera_members enable row level security;

drop policy if exists natilleras_select_admin on public.natilleras;
create policy natilleras_select_admin
on public.natilleras for select
to authenticated
using (public.is_admin());

drop policy if exists natilleras_write_admin on public.natilleras;
create policy natilleras_write_admin
on public.natilleras for insert
to authenticated
with check (public.is_admin());

drop policy if exists natilleras_update_admin on public.natilleras;
create policy natilleras_update_admin
on public.natilleras for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists members_select_admin on public.natillera_members;
create policy members_select_admin
on public.natillera_members for select
to authenticated
using (public.is_admin());

drop policy if exists members_write_admin on public.natillera_members;
create policy members_write_admin
on public.natillera_members for insert
to authenticated
with check (public.is_admin());

drop policy if exists members_delete_admin on public.natillera_members;
create policy members_delete_admin
on public.natillera_members for delete
to authenticated
using (public.is_admin());

create table if not exists public.abonos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_date date not null,
  quincena int not null,
  amount numeric not null check (amount > 0),
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  paid_at timestamptz not null default now()
);

alter table public.abonos
  add constraint abonos_quincena_chk
  check (quincena in (1,2));

alter table public.abonos
  add constraint abonos_status_chk
  check (status in ('pending','approved','rejected'));

create index if not exists abonos_user_idx on public.abonos(user_id);
create index if not exists abonos_period_idx on public.abonos(period_date);

drop index if exists public.abonos_unique_active;
create unique index abonos_unique_active
on public.abonos (user_id, period_date, quincena)
where status in ('pending','approved');

alter table public.abonos enable row level security;

drop policy if exists abonos_select_owner_or_admin on public.abonos;
create policy abonos_select_owner_or_admin
on public.abonos for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists abonos_insert_admin on public.abonos;
create policy abonos_insert_admin
on public.abonos for insert
to authenticated
with check (public.is_admin());

drop policy if exists abonos_insert_owner_pending on public.abonos;
create policy abonos_insert_owner_pending
on public.abonos for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists abonos_update_admin on public.abonos;
create policy abonos_update_admin
on public.abonos for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists abonos_delete_admin on public.abonos;
create policy abonos_delete_admin
on public.abonos for delete
to authenticated
using (public.is_admin());

create table if not exists public.loan_settings (
  id int primary key,
  interest_rate_percent numeric not null default 5,
  max_loan_percent numeric not null default 70,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

insert into public.loan_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.prestamos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  interest_rate_percent numeric not null,
  status text not null default 'pending',
  note text null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id),
  decided_at timestamptz null,
  decided_by uuid null references auth.users(id),
  decision_note text null
);

alter table public.prestamos
  add constraint prestamos_status_chk
  check (status in ('pending','approved','rejected'));

create index if not exists prestamos_user_idx on public.prestamos(user_id);
create index if not exists prestamos_status_idx on public.prestamos(status);
create index if not exists prestamos_created_at_idx on public.prestamos(created_at);

alter table public.loan_settings enable row level security;
alter table public.prestamos enable row level security;

drop policy if exists loan_settings_select_auth on public.loan_settings;
create policy loan_settings_select_auth
on public.loan_settings for select
to authenticated
using (true);

drop policy if exists loan_settings_write_admin on public.loan_settings;
create policy loan_settings_write_admin
on public.loan_settings for insert
to authenticated
with check (public.is_admin());

drop policy if exists loan_settings_update_admin on public.loan_settings;
create policy loan_settings_update_admin
on public.loan_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists prestamos_select_owner_or_admin on public.prestamos;
create policy prestamos_select_owner_or_admin
on public.prestamos for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists prestamos_insert_owner_pending on public.prestamos;
create policy prestamos_insert_owner_pending
on public.prestamos for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists prestamos_update_admin on public.prestamos;
create policy prestamos_update_admin
on public.prestamos for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists prestamos_delete_admin on public.prestamos;
create policy prestamos_delete_admin
on public.prestamos for delete
to authenticated
using (public.is_admin());

create or replace function public.danger_reset_keep_admin(admin_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  v_admin_id uuid;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'No hay sesión (auth.uid() es null)';
  end if;

  select p.user_id into v_admin_id
  from public.profiles p
  where p.phone = admin_phone and p.role = 'admin'
  limit 1;

  if v_admin_id is null then
    raise exception 'No se encontró admin con phone=%', admin_phone;
  end if;

  if v_caller <> v_admin_id then
    raise exception 'No permitido: solo el admin puede ejecutar esto';
  end if;

  delete from public.abonos where user_id <> v_admin_id;
  delete from public.prestamos where user_id <> v_admin_id;
  delete from public.natillera_members where user_id <> v_admin_id;
  delete from public.natilleras where created_by <> v_admin_id;
  delete from public.profiles where user_id <> v_admin_id;

  delete from auth.refresh_tokens where user_id <> v_admin_id::text;
  delete from auth.sessions where user_id::text <> v_admin_id::text;
  delete from auth.identities where user_id::text <> v_admin_id::text;
  delete from auth.mfa_factors where user_id::text <> v_admin_id::text;
  delete from auth.mfa_challenges where factor_id not in (
    select id from auth.mfa_factors where user_id::text = v_admin_id::text
  );
  delete from auth.users where id <> v_admin_id;

  return jsonb_build_object('ok', true, 'admin_id', v_admin_id);
end $$;

revoke all on function public.danger_reset_keep_admin(text) from public;
grant execute on function public.danger_reset_keep_admin(text) to authenticated;
