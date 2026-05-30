-- Week 4 Proteccio Discover Supabase schema.
-- Run this in the Supabase SQL editor before enabling SUPABASE_REQUIRED=true.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'proteccio_app_role') then
    create type public.proteccio_app_role as enum (
      'super_admin',
      'privacy_admin',
      'security_analyst',
      'auditor',
      'viewer'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'proteccio_source_type') then
    create type public.proteccio_source_type as enum ('postgres', 'mysql', 'mongodb', 'api', 's3', 'file');
  end if;
  if not exists (select 1 from pg_type where typname = 'proteccio_source_status') then
    create type public.proteccio_source_status as enum ('draft', 'configured', 'connected', 'scanning', 'failed', 'disabled');
  end if;
end $$;

create table if not exists public.proteccio_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text not null,
  role public.proteccio_app_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proteccio_sources (
  id uuid primary key,
  name text not null,
  type public.proteccio_source_type not null,
  owner text,
  environment text not null default 'development',
  status public.proteccio_source_status not null default 'draft',
  connection jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  last_checked_at timestamptz,
  last_scan_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proteccio_discovery_runs (
  id uuid primary key,
  source_id uuid references public.proteccio_sources(id) on delete set null,
  dataset_id text,
  system_id text,
  source_type text not null,
  source_name text not null,
  entity_name text not null,
  scanned_records integer not null default 0 check (scanned_records >= 0),
  sensitive_records integer not null default 0 check (sensitive_records >= 0),
  discovery_summary jsonb not null default '{}'::jsonb,
  classification_summary jsonb not null default '{}'::jsonb,
  discovery_result jsonb not null default '{}'::jsonb,
  classification_result jsonb,
  profile jsonb,
  risk jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.proteccio_uploaded_files (
  id uuid primary key,
  bucket text not null,
  object_path text not null,
  original_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, object_path)
);

create table if not exists public.proteccio_events (
  id text primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.proteccio_catalog_snapshots (
  id text primary key,
  dataset_id text not null unique,
  system_id text not null,
  source_type text not null,
  source_name text not null,
  entity_name text not null,
  risk_level text not null,
  total_records integer not null default 0 check (total_records >= 0),
  sensitive_records integer not null default 0 check (sensitive_records >= 0),
  mapped boolean not null default false,
  discovery_summary jsonb not null default '{}'::jsonb,
  classification_summary jsonb not null default '{}'::jsonb,
  profile jsonb not null default '{}'::jsonb,
  risk jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proteccio_mapping_inventory (
  id text primary key,
  exported_at timestamptz not null default now(),
  systems jsonb not null default '[]'::jsonb,
  datasets jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  flows jsonb not null default '[]'::jsonb,
  duplicate_groups jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.proteccio_remediation_tickets (
  id uuid primary key,
  dataset_id text,
  source text not null,
  risk_type text not null,
  classification_category text not null,
  suggested_action text not null,
  assigned_user text,
  resolution_notes text,
  severity text not null,
  status text not null,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proteccio_reports (
  id uuid primary key,
  report_type text not null,
  title text not null,
  generated_at timestamptz not null default now(),
  primary_format text not null,
  summary text not null,
  tags text[] not null default '{}'::text[],
  generated_by text,
  file_base_name text not null,
  content jsonb not null default '{}'::jsonb
);

create table if not exists public.proteccio_audit_logs (
  id uuid primary key,
  timestamp timestamptz not null default now(),
  source text not null,
  action text not null,
  status text not null,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.proteccio_alerts (
  id uuid primary key,
  type text not null,
  severity text not null,
  title text not null,
  message text not null,
  subject_key text not null,
  dataset_id text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null,
  channels text[] not null default '{}'::text[],
  dedupe_key text not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.proteccio_notifications (
  id uuid primary key,
  alert_id uuid references public.proteccio_alerts(id) on delete cascade,
  type text not null,
  severity text not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  dataset_id text,
  delivery jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.proteccio_workflow_runs (
  id uuid primary key,
  status text not null,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  actor_id text,
  dataset_id text,
  report_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists proteccio_profiles_role_idx on public.proteccio_profiles(role);
create index if not exists proteccio_sources_type_status_idx on public.proteccio_sources(type, status);
create index if not exists proteccio_sources_updated_idx on public.proteccio_sources(updated_at desc);
create index if not exists proteccio_sources_source_name_idx on public.proteccio_sources using btree (lower(name));
create index if not exists proteccio_discovery_runs_dataset_idx on public.proteccio_discovery_runs(dataset_id);
create index if not exists proteccio_discovery_runs_created_idx on public.proteccio_discovery_runs(created_at desc);
create index if not exists proteccio_discovery_runs_source_idx on public.proteccio_discovery_runs(source_type, source_name);
create index if not exists proteccio_discovery_runs_created_by_idx on public.proteccio_discovery_runs(created_by);
create index if not exists proteccio_discovery_runs_discovery_summary_gin_idx on public.proteccio_discovery_runs using gin (discovery_summary);
create index if not exists proteccio_discovery_runs_classification_summary_gin_idx on public.proteccio_discovery_runs using gin (classification_summary);
create index if not exists proteccio_uploaded_files_uploaded_by_idx on public.proteccio_uploaded_files(uploaded_by);
create index if not exists proteccio_uploaded_files_created_idx on public.proteccio_uploaded_files(created_at desc);
create index if not exists proteccio_events_created_idx on public.proteccio_events(created_at desc);
create index if not exists proteccio_events_type_created_idx on public.proteccio_events(event_type, created_at desc);
create index if not exists proteccio_catalog_source_idx on public.proteccio_catalog_snapshots(source_type, source_name);
create index if not exists proteccio_catalog_risk_idx on public.proteccio_catalog_snapshots(risk_level);
create index if not exists proteccio_catalog_updated_idx on public.proteccio_catalog_snapshots(updated_at desc);
create index if not exists proteccio_catalog_discovery_gin_idx on public.proteccio_catalog_snapshots using gin (discovery_summary);
create index if not exists proteccio_catalog_classification_gin_idx on public.proteccio_catalog_snapshots using gin (classification_summary);
create index if not exists proteccio_remediation_status_idx on public.proteccio_remediation_tickets(status, severity);
create index if not exists proteccio_remediation_dataset_idx on public.proteccio_remediation_tickets(dataset_id);
create index if not exists proteccio_remediation_updated_idx on public.proteccio_remediation_tickets(updated_at desc);
create index if not exists proteccio_reports_type_generated_idx on public.proteccio_reports(report_type, generated_at desc);
create index if not exists proteccio_reports_tags_gin_idx on public.proteccio_reports using gin (tags);
create index if not exists proteccio_audit_action_timestamp_idx on public.proteccio_audit_logs(action, timestamp desc);
create index if not exists proteccio_audit_status_timestamp_idx on public.proteccio_audit_logs(status, timestamp desc);
create index if not exists proteccio_alerts_type_status_idx on public.proteccio_alerts(type, status);
create index if not exists proteccio_alerts_dataset_idx on public.proteccio_alerts(dataset_id);
create index if not exists proteccio_notifications_alert_idx on public.proteccio_notifications(alert_id);
create index if not exists proteccio_notifications_read_idx on public.proteccio_notifications(read, created_at desc);
create index if not exists proteccio_workflow_runs_created_idx on public.proteccio_workflow_runs(created_at desc);
create index if not exists proteccio_workflow_runs_dataset_idx on public.proteccio_workflow_runs(dataset_id);

create or replace function public.proteccio_current_role()
returns public.proteccio_app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.proteccio_profiles
  where user_id = auth.uid()
    and active = true
$$;

create or replace function public.proteccio_has_role(roles public.proteccio_app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.proteccio_current_role() = any(roles), false)
$$;

alter table public.proteccio_profiles enable row level security;
alter table public.proteccio_sources enable row level security;
alter table public.proteccio_discovery_runs enable row level security;
alter table public.proteccio_uploaded_files enable row level security;
alter table public.proteccio_events enable row level security;
alter table public.proteccio_catalog_snapshots enable row level security;
alter table public.proteccio_mapping_inventory enable row level security;
alter table public.proteccio_remediation_tickets enable row level security;
alter table public.proteccio_reports enable row level security;
alter table public.proteccio_audit_logs enable row level security;
alter table public.proteccio_alerts enable row level security;
alter table public.proteccio_notifications enable row level security;
alter table public.proteccio_workflow_runs enable row level security;

drop policy if exists "profiles read own or admins" on public.proteccio_profiles;
create policy "profiles read own or admins"
  on public.proteccio_profiles
  for select
  using (
    auth.uid() = user_id
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'auditor']::public.proteccio_app_role[])
  );

drop policy if exists "profiles admins manage" on public.proteccio_profiles;
create policy "profiles admins manage"
  on public.proteccio_profiles
  for all
  using (public.proteccio_has_role(array['super_admin']::public.proteccio_app_role[]) or auth.role() = 'service_role')
  with check (public.proteccio_has_role(array['super_admin']::public.proteccio_app_role[]) or auth.role() = 'service_role');

drop policy if exists "sources read authenticated" on public.proteccio_sources;
create policy "sources read authenticated"
  on public.proteccio_sources
  for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists "sources write operators" on public.proteccio_sources;
create policy "sources write operators"
  on public.proteccio_sources
  for all
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst']::public.proteccio_app_role[])
  )
  with check (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst']::public.proteccio_app_role[])
  );

drop policy if exists "discovery read governance users" on public.proteccio_discovery_runs;
create policy "discovery read governance users"
  on public.proteccio_discovery_runs
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor']::public.proteccio_app_role[])
  );

drop policy if exists "discovery write operators" on public.proteccio_discovery_runs;
create policy "discovery write operators"
  on public.proteccio_discovery_runs
  for insert
  with check (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst']::public.proteccio_app_role[])
  );

drop policy if exists "files read owners and governance" on public.proteccio_uploaded_files;
create policy "files read owners and governance"
  on public.proteccio_uploaded_files
  for select
  using (
    auth.role() = 'service_role'
    or uploaded_by = auth.uid()
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor']::public.proteccio_app_role[])
  );

drop policy if exists "files insert operators" on public.proteccio_uploaded_files;
create policy "files insert operators"
  on public.proteccio_uploaded_files
  for insert
  with check (
    auth.role() = 'service_role'
    or uploaded_by = auth.uid()
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst']::public.proteccio_app_role[])
  );

drop policy if exists "events read authenticated" on public.proteccio_events;
create policy "events read authenticated"
  on public.proteccio_events
  for select
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists "events service writes" on public.proteccio_events;
create policy "events service writes"
  on public.proteccio_events
  for insert
  with check (auth.role() = 'service_role');

drop policy if exists "catalog read governance users" on public.proteccio_catalog_snapshots;
create policy "catalog read governance users"
  on public.proteccio_catalog_snapshots
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor', 'viewer']::public.proteccio_app_role[])
  );

drop policy if exists "catalog service writes" on public.proteccio_catalog_snapshots;
create policy "catalog service writes"
  on public.proteccio_catalog_snapshots
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "mapping read governance users" on public.proteccio_mapping_inventory;
create policy "mapping read governance users"
  on public.proteccio_mapping_inventory
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor', 'viewer']::public.proteccio_app_role[])
  );

drop policy if exists "mapping service writes" on public.proteccio_mapping_inventory;
create policy "mapping service writes"
  on public.proteccio_mapping_inventory
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "remediation read governance users" on public.proteccio_remediation_tickets;
create policy "remediation read governance users"
  on public.proteccio_remediation_tickets
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor', 'viewer']::public.proteccio_app_role[])
  );

drop policy if exists "remediation service writes" on public.proteccio_remediation_tickets;
create policy "remediation service writes"
  on public.proteccio_remediation_tickets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "reports read governance users" on public.proteccio_reports;
create policy "reports read governance users"
  on public.proteccio_reports
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor', 'viewer']::public.proteccio_app_role[])
  );

drop policy if exists "reports service writes" on public.proteccio_reports;
create policy "reports service writes"
  on public.proteccio_reports
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "audit read auditors admins" on public.proteccio_audit_logs;
create policy "audit read auditors admins"
  on public.proteccio_audit_logs
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'auditor']::public.proteccio_app_role[])
  );

drop policy if exists "audit service writes" on public.proteccio_audit_logs;
create policy "audit service writes"
  on public.proteccio_audit_logs
  for insert
  with check (auth.role() = 'service_role');

drop policy if exists "alerts read governance users" on public.proteccio_alerts;
create policy "alerts read governance users"
  on public.proteccio_alerts
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor']::public.proteccio_app_role[])
  );

drop policy if exists "alerts service writes" on public.proteccio_alerts;
create policy "alerts service writes"
  on public.proteccio_alerts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "notifications read governance users" on public.proteccio_notifications;
create policy "notifications read governance users"
  on public.proteccio_notifications
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor']::public.proteccio_app_role[])
  );

drop policy if exists "notifications service writes" on public.proteccio_notifications;
create policy "notifications service writes"
  on public.proteccio_notifications
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "workflow read operators" on public.proteccio_workflow_runs;
create policy "workflow read operators"
  on public.proteccio_workflow_runs
  for select
  using (
    auth.role() = 'service_role'
    or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor']::public.proteccio_app_role[])
  );

drop policy if exists "workflow service writes" on public.proteccio_workflow_runs;
create policy "workflow service writes"
  on public.proteccio_workflow_runs
  for insert
  with check (auth.role() = 'service_role');

insert into storage.buckets (id, name, public, file_size_limit)
values ('proteccio-uploads', 'proteccio-uploads', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "proteccio storage read governance" on storage.objects;
create policy "proteccio storage read governance"
  on storage.objects
  for select
  using (
    bucket_id = 'proteccio-uploads'
    and (
      owner = auth.uid()
      or auth.role() = 'service_role'
      or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst', 'auditor']::public.proteccio_app_role[])
    )
  );

drop policy if exists "proteccio storage write operators" on storage.objects;
create policy "proteccio storage write operators"
  on storage.objects
  for insert
  with check (
    bucket_id = 'proteccio-uploads'
    and (
      auth.role() = 'service_role'
      or public.proteccio_has_role(array['super_admin', 'privacy_admin', 'security_analyst']::public.proteccio_app_role[])
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'proteccio_events'
  ) then
    alter publication supabase_realtime add table public.proteccio_events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'proteccio_catalog_snapshots'
  ) then
    alter publication supabase_realtime add table public.proteccio_catalog_snapshots;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'proteccio_remediation_tickets'
  ) then
    alter publication supabase_realtime add table public.proteccio_remediation_tickets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'proteccio_alerts'
  ) then
    alter publication supabase_realtime add table public.proteccio_alerts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'proteccio_workflow_runs'
  ) then
    alter publication supabase_realtime add table public.proteccio_workflow_runs;
  end if;
end $$;
