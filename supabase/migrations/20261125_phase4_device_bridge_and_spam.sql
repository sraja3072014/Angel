-- ============================================================================
-- PROJECT ANGEL — PHASE 4 REALTIME DEVICE BRIDGE, CALL LOGS & SPAM GUARD
-- Tables: device_sync_events, call_logs, spam_registry (RLS per Gmail user)
-- ============================================================================

-- 1. CROSS-DEVICE REALTIME SYNC EVENTS (Calls, Clipboard, File Drops)
create table if not exists public.device_sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null,
  source_device text not null check (source_device in ('android', 'windows', 'web')),
  target_device text not null check (target_device in ('android', 'windows', 'all')),
  event_type text not null check (event_type in (
    'incoming_call',
    'call_action',
    'call_transcript',
    'clipboard_sync',
    'file_handoff',
    'sms_incoming'
  )),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'handled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_device_sync_user on public.device_sync_events(user_id, created_at desc);
alter table public.device_sync_events enable row level security;

drop policy if exists "device_sync_select_own" on public.device_sync_events;
create policy "device_sync_select_own" on public.device_sync_events
  for select using (auth.uid() = user_id);

drop policy if exists "device_sync_insert_own" on public.device_sync_events;
create policy "device_sync_insert_own" on public.device_sync_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "device_sync_update_own" on public.device_sync_events;
create policy "device_sync_update_own" on public.device_sync_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. CALL LOGS & AI SCREENING TRANSCRIPTS
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null,
  caller_number text not null,
  caller_name text,
  grace_church_member_id uuid,
  handling_mode text not null check (handling_mode in ('picked_up', 'ai_screened', 'rejected_auto_sms', 'spam_blocked')),
  transcript text,
  auto_reply_sent text,
  duration_seconds int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_call_logs_user on public.call_logs(user_id, created_at desc);
alter table public.call_logs enable row level security;

drop policy if exists "call_logs_select_own" on public.call_logs;
create policy "call_logs_select_own" on public.call_logs
  for select using (auth.uid() = user_id);

drop policy if exists "call_logs_insert_own" on public.call_logs;
create policy "call_logs_insert_own" on public.call_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "call_logs_update_own" on public.call_logs;
create policy "call_logs_update_own" on public.call_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. CALLER ID & SPAM GUARD REGISTRY
create table if not exists public.spam_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  phone_number text not null,
  label text not null default 'Suspected Spam',
  risk_score int not null default 80 check (risk_score >= 0 and risk_score <= 100),
  auto_block boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, phone_number)
);

alter table public.spam_registry enable row level security;

drop policy if exists "spam_registry_select_own" on public.spam_registry;
create policy "spam_registry_select_own" on public.spam_registry
  for select using (auth.uid() = user_id);

drop policy if exists "spam_registry_insert_own" on public.spam_registry;
create policy "spam_registry_insert_own" on public.spam_registry
  for insert with check (auth.uid() = user_id);

drop policy if exists "spam_registry_delete_own" on public.spam_registry;
create policy "spam_registry_delete_own" on public.spam_registry
  for delete using (auth.uid() = user_id);
