-- ============================================================================
-- PROJECT ANGEL — PHASE 3 STUDIOS & HOT-LOADABLE TOOL REGISTRY MIGRATION
-- Tables: angel_tools, studio_projects (with RLS per Gmail user)
-- ============================================================================

-- 1. HOT-RELOADABLE TOOL REGISTRY (angel_tools)
create table if not exists public.angel_tools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null,
  name text not null,
  description text not null,
  source_type text not null default 'self_generated' check (source_type in ('self_generated', 'manifest_import')),
  manifest_url text,
  json_schema jsonb not null default '{}'::jsonb,
  ts_code text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists idx_angel_tools_user on public.angel_tools(user_id, is_enabled);
alter table public.angel_tools enable row level security;

drop policy if exists "tools_select_own" on public.angel_tools;
create policy "tools_select_own" on public.angel_tools
  for select using (auth.uid() = user_id);

drop policy if exists "tools_insert_own" on public.angel_tools;
create policy "tools_insert_own" on public.angel_tools
  for insert with check (auth.uid() = user_id);

drop policy if exists "tools_update_own" on public.angel_tools;
create policy "tools_update_own" on public.angel_tools
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tools_delete_own" on public.angel_tools;
create policy "tools_delete_own" on public.angel_tools
  for delete using (auth.uid() = user_id);

-- 2. STUDIO PROJECTS (AnyCraft, Motion, 3D)
create table if not exists public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null,
  studio_type text not null check (studio_type in ('anycraft', 'motion', 'threed')),
  title text not null,
  prompt_text text,
  project_state jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_studio_projects_user on public.studio_projects(user_id, studio_type);
alter table public.studio_projects enable row level security;

drop policy if exists "studio_projects_select_own" on public.studio_projects;
create policy "studio_projects_select_own" on public.studio_projects
  for select using (auth.uid() = user_id);

drop policy if exists "studio_projects_insert_own" on public.studio_projects;
create policy "studio_projects_insert_own" on public.studio_projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "studio_projects_update_own" on public.studio_projects;
create policy "studio_projects_update_own" on public.studio_projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "studio_projects_delete_own" on public.studio_projects;
create policy "studio_projects_delete_own" on public.studio_projects
  for delete using (auth.uid() = user_id);
