-- GoVio account foundation.
-- This file is not applied automatically. Run it with `supabase db push` or the Supabase SQL editor.
-- Deleting a row in auth.users cascades that person's profile and owned rows.
-- Private receipt objects are deleted by delete_private_receipts, and the account route tries to remove them first.
-- No local ledger rows are imported here. Household bills, year coverage, and odometer readings that are not
-- columns on these tables stay on the device until a later confirmed migration.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 80)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text,
  make text not null default '',
  model text not null default '',
  year integer,
  nickname text not null default '',
  fuel_type text not null default 'gasoline',
  litres_per_100km numeric(8, 2),
  wear_per_km numeric(12, 4),
  initial_odometer integer,
  initial_odometer_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_fuel_type check (
    fuel_type in ('gasoline', 'diesel', 'hybrid', 'plugin-hybrid', 'electric', 'other')
  ),
  constraint vehicles_year check (year is null or (year >= 1980 and year <= 2100)),
  constraint vehicles_initial_odometer check (initial_odometer is null or initial_odometer >= 0)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text,
  storage_path text not null,
  file_name text not null default '',
  content_type text not null default '',
  byte_size integer,
  content_hash text,
  created_at timestamptz not null default now(),
  constraint receipts_byte_size check (byte_size is null or byte_size >= 0),
  constraint receipts_private_prefix check (starts_with(storage_path, user_id::text || '/'))
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text,
  shift_date date not null,
  start_time text not null,
  end_time text not null,
  earnings numeric(12, 2) not null,
  kilometres numeric(12, 1) not null,
  orders integer,
  area text not null default '',
  note text not null default '',
  platform text not null default 'SkipTheDishes',
  vehicle_id uuid references public.vehicles (id) on delete set null,
  start_odometer integer,
  end_odometer integer,
  purpose text not null default 'unclassified',
  business_kilometres numeric(12, 1),
  business_purpose text not null default '',
  receipt_id uuid references public.receipts (id) on delete set null,
  local_evidence_id text,
  overlap_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_earnings check (earnings >= 0),
  constraint shifts_kilometres check (kilometres >= 0),
  constraint shifts_orders check (orders is null or orders >= 0),
  constraint shifts_odometer check (
    (start_odometer is null or start_odometer >= 0)
    and (end_odometer is null or end_odometer >= 0)
  ),
  constraint shifts_purpose check (purpose in ('unclassified', 'business', 'personal', 'mixed')),
  constraint shifts_business_kilometres check (business_kilometres is null or business_kilometres >= 0)
);

create table public.fuel_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text,
  purchase_date date not null,
  litres numeric(12, 2) not null,
  price_per_litre numeric(12, 3) not null,
  total numeric(12, 2) not null,
  station text not null default '',
  odometer integer,
  claim_status text not null default 'unreviewed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_purchases_amounts check (litres > 0 and price_per_litre > 0 and total >= 0),
  constraint fuel_purchases_odometer check (odometer is null or odometer >= 0),
  constraint fuel_purchases_claim check (claim_status in ('unreviewed', 'not-claimed', 'claimed'))
);

create table public.mileage_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  entry_date date not null,
  start_odometer integer,
  end_odometer integer,
  kilometres numeric(12, 1) not null,
  purpose text not null default 'unclassified',
  business_kilometres numeric(12, 1),
  description text not null default '',
  note text not null default '',
  receipt_id uuid references public.receipts (id) on delete set null,
  local_evidence_id text,
  shift_id uuid references public.shifts (id) on delete set null,
  local_shift_id text,
  overlap_acknowledged boolean not null default false,
  gps_started_at timestamptz,
  gps_ended_at timestamptz,
  trace_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mileage_entries_kilometres check (kilometres >= 0),
  constraint mileage_entries_odometer check (
    (start_odometer is null or start_odometer >= 0)
    and (end_odometer is null or end_odometer >= 0)
  ),
  constraint mileage_entries_purpose check (purpose in ('unclassified', 'business', 'personal', 'mixed')),
  constraint mileage_entries_business_kilometres check (business_kilometres is null or business_kilometres >= 0),
  -- GPS traces, if a later version stores them, stay under the owner's private prefix.
  constraint mileage_entries_trace_private check (
    trace_storage_path is null or starts_with(trace_storage_path, user_id::text || '/')
  )
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  category text not null,
  merchant text not null default '',
  expense_date date not null,
  fuel_type text not null default '',
  litres numeric(12, 2),
  price_per_litre numeric(12, 3),
  subtotal numeric(12, 2),
  tax numeric(12, 2),
  total numeric(12, 2) not null,
  currency text not null default 'CAD',
  claim_status text not null default 'unreviewed',
  note text not null default '',
  receipt_id uuid references public.receipts (id) on delete set null,
  local_image_id text,
  image_name text not null default '',
  image_hash text,
  image_saved boolean not null default false,
  fuel_purchase_id uuid references public.fuel_purchases (id) on delete set null,
  local_fuel_fill_id text,
  uploaded_at date,
  duplicate_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_category check (
    category in ('fuel', 'maintenance', 'insurance', 'registration', 'loan-interest', 'parking', 'other')
  ),
  constraint expenses_amounts check (
    total >= 0
    and (litres is null or litres > 0)
    and (price_per_litre is null or price_per_litre > 0)
    and (subtotal is null or subtotal >= 0)
    and (tax is null or tax >= 0)
  ),
  constraint expenses_claim check (claim_status in ('unreviewed', 'not-claimed', 'claimed'))
);

create unique index vehicles_user_local_id_idx on public.vehicles (user_id, local_id) where local_id is not null;
create unique index receipts_user_local_id_idx on public.receipts (user_id, local_id) where local_id is not null;
create unique index shifts_user_local_id_idx on public.shifts (user_id, local_id) where local_id is not null;
create unique index fuel_purchases_user_local_id_idx on public.fuel_purchases (user_id, local_id) where local_id is not null;
create unique index mileage_entries_user_local_id_idx on public.mileage_entries (user_id, local_id) where local_id is not null;
create unique index expenses_user_local_id_idx on public.expenses (user_id, local_id) where local_id is not null;

create index shifts_user_date_idx on public.shifts (user_id, shift_date desc);
create index fuel_purchases_user_date_idx on public.fuel_purchases (user_id, purchase_date desc);
create index mileage_entries_user_date_idx on public.mileage_entries (user_id, entry_date desc);
create index expenses_user_date_idx on public.expenses (user_id, expense_date desc);
create index receipts_user_idx on public.receipts (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.vehicles enable row level security;
alter table public.vehicles force row level security;
alter table public.receipts enable row level security;
alter table public.receipts force row level security;
alter table public.shifts enable row level security;
alter table public.shifts force row level security;
alter table public.fuel_purchases enable row level security;
alter table public.fuel_purchases force row level security;
alter table public.mileage_entries enable row level security;
alter table public.mileage_entries force row level security;
alter table public.expenses enable row level security;
alter table public.expenses force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
create policy profiles_delete_own on public.profiles
  for delete to authenticated
  using (auth.uid() = id);

create policy vehicles_select_own on public.vehicles
  for select to authenticated using (auth.uid() = user_id);
create policy vehicles_insert_own on public.vehicles
  for insert to authenticated with check (auth.uid() = user_id);
create policy vehicles_update_own on public.vehicles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy vehicles_delete_own on public.vehicles
  for delete to authenticated using (auth.uid() = user_id);

create policy receipts_select_own on public.receipts
  for select to authenticated using (auth.uid() = user_id);
create policy receipts_insert_own on public.receipts
  for insert to authenticated with check (auth.uid() = user_id);
create policy receipts_update_own on public.receipts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy receipts_delete_own on public.receipts
  for delete to authenticated using (auth.uid() = user_id);

create policy shifts_select_own on public.shifts
  for select to authenticated using (auth.uid() = user_id);
create policy shifts_insert_own on public.shifts
  for insert to authenticated with check (auth.uid() = user_id);
create policy shifts_update_own on public.shifts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy shifts_delete_own on public.shifts
  for delete to authenticated using (auth.uid() = user_id);

create policy fuel_purchases_select_own on public.fuel_purchases
  for select to authenticated using (auth.uid() = user_id);
create policy fuel_purchases_insert_own on public.fuel_purchases
  for insert to authenticated with check (auth.uid() = user_id);
create policy fuel_purchases_update_own on public.fuel_purchases
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy fuel_purchases_delete_own on public.fuel_purchases
  for delete to authenticated using (auth.uid() = user_id);

create policy mileage_entries_select_own on public.mileage_entries
  for select to authenticated using (auth.uid() = user_id);
create policy mileage_entries_insert_own on public.mileage_entries
  for insert to authenticated with check (auth.uid() = user_id);
create policy mileage_entries_update_own on public.mileage_entries
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy mileage_entries_delete_own on public.mileage_entries
  for delete to authenticated using (auth.uid() = user_id);

create policy expenses_select_own on public.expenses
  for select to authenticated using (auth.uid() = user_id);
create policy expenses_insert_own on public.expenses
  for insert to authenticated with check (auth.uid() = user_id);
create policy expenses_update_own on public.expenses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy expenses_delete_own on public.expenses
  for delete to authenticated using (auth.uid() = user_id);

revoke all on table public.profiles from anon, public;
revoke all on table public.vehicles from anon, public;
revoke all on table public.receipts from anon, public;
revoke all on table public.shifts from anon, public;
revoke all on table public.fuel_purchases from anon, public;
revoke all on table public.mileage_entries from anon, public;
revoke all on table public.expenses from anon, public;

grant select, delete on table public.profiles to authenticated;
grant insert (id, full_name, email) on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

grant select, insert, update, delete on table public.vehicles to authenticated;
grant select, insert, update, delete on table public.receipts to authenticated;
grant select, insert, update, delete on table public.shifts to authenticated;
grant select, insert, update, delete on table public.fuel_purchases to authenticated;
grant select, insert, update, delete on table public.mileage_entries to authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
create trigger shifts_set_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();
create trigger fuel_purchases_set_updated_at before update on public.fuel_purchases
  for each row execute function public.set_updated_at();
create trigger mileage_entries_set_updated_at before update on public.mileage_entries
  for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- Creates the profile from the signup metadata. The id always comes from auth.users, never from a client payload.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''), ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = coalesce(new.email, ''),
      updated_at = pg_catalog.now()
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- Storage objects are not foreign-keyed to auth.users, so this trigger removes the private prefix.
create or replace function public.delete_private_receipts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from storage.objects
  where bucket_id = 'receipts'
    and name like (old.id::text || '/%');
  return old;
end;
$$;

create trigger on_auth_user_deleted_receipts
  after delete on auth.users
  for each row execute function public.delete_private_receipts();

revoke all on function public.handle_new_user() from public;
revoke all on function public.sync_profile_email() from public;
revoke all on function public.delete_private_receipts() from public;
revoke all on function public.set_updated_at() from public;
grant execute on function public.handle_new_user() to supabase_auth_admin, service_role, postgres;
grant execute on function public.sync_profile_email() to supabase_auth_admin, service_role, postgres;
grant execute on function public.delete_private_receipts() to supabase_auth_admin, service_role, postgres;
grant execute on function public.set_updated_at() to authenticated, service_role, postgres;

insert into storage.buckets (id, name, public, file_size_limit)
values ('receipts', 'receipts', false, 8388608)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

-- UUID prefixes contain no LIKE wildcards. split_part keeps the first folder exact.
create policy storage_receipts_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and name like (auth.uid()::text || '/%')
    and split_part(name, '/', 1) = auth.uid()::text
  );
create policy storage_receipts_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and name like (auth.uid()::text || '/%')
    and split_part(name, '/', 1) = auth.uid()::text
  );
create policy storage_receipts_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and name like (auth.uid()::text || '/%')
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts'
    and name like (auth.uid()::text || '/%')
    and split_part(name, '/', 1) = auth.uid()::text
  );
create policy storage_receipts_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and name like (auth.uid()::text || '/%')
    and split_part(name, '/', 1) = auth.uid()::text
  );
