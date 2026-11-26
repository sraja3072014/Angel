-- ============================================================================
-- PROJECT ANGEL — PHASE 1 SUPABASE SCHEMA & ROW-LEVEL SECURITY (RLS) MIGRATION
-- Tables: users, angel_skills, angel_dev_tasks, memories
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. USERS & ISOLATED WORKSPACES
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('admin', 'member')),
  workspace_id uuid not null default gen_random_uuid(),
  active_context text not null default 'personal',
  persona_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 2. SELF-GENERATING SKILLS (angel_skills)
create table if not exists public.angel_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null,
  name text not null,
  topic text not null,
  description text,
  skill_md text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_angel_skills_user on public.angel_skills(user_id, is_active);
alter table public.angel_skills enable row level security;

drop policy if exists "skills_select_own" on public.angel_skills;
create policy "skills_select_own" on public.angel_skills
  for select using (auth.uid() = user_id);

drop policy if exists "skills_insert_own" on public.angel_skills;
create policy "skills_insert_own" on public.angel_skills
  for insert with check (auth.uid() = user_id);

drop policy if exists "skills_update_own" on public.angel_skills;
create policy "skills_update_own" on public.angel_skills
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "skills_delete_own" on public.angel_skills;
create policy "skills_delete_own" on public.angel_skills
  for delete using (auth.uid() = user_id);

-- 3. AUTONOMOUS SELF-CODING QUEUE (angel_dev_tasks)
create table if not exists public.angel_dev_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null,
  title text not null,
  prompt_text text not null,
  target_branch text not null,
  status text not null default 'queued' check (status in ('queued', 'in_progress', 'verified', 'failed')),
  build_log text,
  source_device text not null default 'desktop',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_angel_dev_tasks_status on public.angel_dev_tasks(user_id, status);
alter table public.angel_dev_tasks enable row level security;

drop policy if exists "dev_tasks_select_own" on public.angel_dev_tasks;
create policy "dev_tasks_select_own" on public.angel_dev_tasks
  for select using (auth.uid() = user_id);

drop policy if exists "dev_tasks_insert_own" on public.angel_dev_tasks;
create policy "dev_tasks_insert_own" on public.angel_dev_tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "dev_tasks_update_own" on public.angel_dev_tasks;
create policy "dev_tasks_update_own" on public.angel_dev_tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "dev_tasks_delete_own" on public.angel_dev_tasks;
create policy "dev_tasks_delete_own" on public.angel_dev_tasks
  for delete using (auth.uid() = user_id);

-- 4. ISOLATED MEMORIES (memories)
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null,
  category text not null default 'general',
  mem_key text not null,
  mem_value text not null,
  device_origin text not null default 'windows',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mem_key)
);

create index if not exists idx_memories_user_cat on public.memories(user_id, category);
alter table public.memories enable row level security;

drop policy if exists "memories_select_own" on public.memories;
create policy "memories_select_own" on public.memories
  for select using (auth.uid() = user_id);

drop policy if exists "memories_insert_own" on public.memories;
create policy "memories_insert_own" on public.memories
  for insert with check (auth.uid() = user_id);

drop policy if exists "memories_update_own" on public.memories;
create policy "memories_update_own" on public.memories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "memories_delete_own" on public.memories;
create policy "memories_delete_own" on public.memories
  for delete using (auth.uid() = user_id);

-- 5. AUTO-PROVISION WORKSPACE ON GOOGLE OAUTH (GMAIL LOGIN)
create or replace function public.handle_new_angel_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'member';
  v_context text := 'personal';
begin
  -- Identify Raja as primary admin with Grace Church Management co-pilot context
  if lower(coalesce(new.email, '')) in ('sraja3072014@gmail.com', 'raja@gracechurch.org') then
    v_role := 'admin';
    v_context := 'grace_church_management';
  end if;

  insert into public.users (id, email, full_name, avatar_url, role, active_context)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'User'), '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    v_role,
    v_context
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.users.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_angel on auth.users;
create trigger on_auth_user_created_angel
  after insert on auth.users
  for each row execute function public.handle_new_angel_user();
