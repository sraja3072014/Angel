-- ============================================================================
-- PROJECT ANGEL — PHASE 2 HYBRID LONG-TERM VECTOR MEMORY (pgvector + RLS)
-- ============================================================================

create extension if not exists vector;

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null,
  category text not null default 'fact', -- 'fact' | 'decision' | 'preference' | 'grace_church'
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_memories_user on public.user_memories(user_id, category);
create index if not exists idx_user_memories_embedding on public.user_memories
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);

alter table public.user_memories enable row level security;

drop policy if exists "user_memories_select_own" on public.user_memories;
create policy "user_memories_select_own" on public.user_memories
  for select using (auth.uid() = user_id);

drop policy if exists "user_memories_insert_own" on public.user_memories;
create policy "user_memories_insert_own" on public.user_memories
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_memories_update_own" on public.user_memories;
create policy "user_memories_update_own" on public.user_memories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_memories_delete_own" on public.user_memories;
create policy "user_memories_delete_own" on public.user_memories
  for delete using (auth.uid() = user_id);

-- Cosine similarity semantic recall RPC (scoped strictly to calling auth.uid())
create or replace function public.match_memories(
  query_embedding vector(768),
  match_threshold float default 0.55,
  match_count int default 5
)
returns table (
  id uuid,
  category text,
  content text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
language sql
stable
as $$
  select
    um.id,
    um.category,
    um.content,
    um.metadata,
    1 - (um.embedding <=> query_embedding) as similarity,
    um.created_at
  from public.user_memories um
  where um.user_id = auth.uid()
    and 1 - (um.embedding <=> query_embedding) >= match_threshold
  order by um.embedding <=> query_embedding
  limit match_count;
$$;
