-- Krumer: sincronização offline-first (Auth + Data API, sem Realtime).
-- Aplique pelo Supabase CLI ou SQL Editor em um projeto novo.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  title text not null,
  type text not null check (type in ('book', 'series', 'chapter', 'comic', 'graphic_novel')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  progress_pct double precision not null default 0 check (progress_pct between 0 and 100),
  current_page integer not null default 0 check (current_page >= 0),
  total_pages integer check (total_pages is null or total_pages >= 0),
  cfi text,
  is_read boolean not null default false,
  rating smallint check (rating between 1 and 5),
  rating_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create table if not exists public.user_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, name),
  unique (id, user_id)
);

create table if not exists public.list_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null,
  fingerprint text not null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (list_id, fingerprint),
  foreign key (list_id, user_id)
    references public.user_lists (id, user_id)
    on delete cascade
);

-- Índices para os filtros de RLS, cursores de pull e FKs.
create index if not exists sync_items_user_updated_idx
  on public.sync_items (user_id, updated_at, id);
create index if not exists reading_progress_user_updated_idx
  on public.reading_progress (user_id, updated_at, id);
create index if not exists user_lists_user_updated_idx
  on public.user_lists (user_id, updated_at, id);
create index if not exists list_memberships_user_updated_idx
  on public.list_memberships (user_id, updated_at, id);
create index if not exists list_memberships_list_user_idx
  on public.list_memberships (list_id, user_id);

create or replace function public.set_sync_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sync_items_updated_at on public.sync_items;
create trigger set_sync_items_updated_at
before update on public.sync_items
for each row execute function public.set_sync_updated_at();

drop trigger if exists set_reading_progress_updated_at on public.reading_progress;
create trigger set_reading_progress_updated_at
before update on public.reading_progress
for each row execute function public.set_sync_updated_at();

drop trigger if exists set_user_lists_updated_at on public.user_lists;
create trigger set_user_lists_updated_at
before update on public.user_lists
for each row execute function public.set_sync_updated_at();

drop trigger if exists set_list_memberships_updated_at on public.list_memberships;
create trigger set_list_memberships_updated_at
before update on public.list_memberships
for each row execute function public.set_sync_updated_at();

-- Progresso é monotônico; avaliação só muda quando o cliente declara o gesto.
-- SECURITY INVOKER mantém RLS ativo: não há bypass de autorização nesta RPC.
create or replace function public.merge_reading_progress(
  p_fingerprint text,
  p_title text,
  p_type text,
  p_progress_pct double precision,
  p_current_page integer,
  p_total_pages integer,
  p_cfi text,
  p_is_read boolean,
  p_rating smallint,
  p_rating_changed boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.reading_progress%rowtype;
  v_progress_pct double precision := greatest(0, least(100, coalesce(p_progress_pct, 0)));
  v_current_page integer := greatest(0, coalesce(p_current_page, 0));
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if coalesce(trim(p_fingerprint), '') = '' then
    raise exception 'fingerprint is required';
  end if;
  if p_type not in ('book', 'series', 'chapter', 'comic', 'graphic_novel') then
    raise exception 'Invalid item type';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'Invalid rating';
  end if;

  insert into public.sync_items (user_id, fingerprint, title, type)
  values (v_user_id, p_fingerprint, coalesce(nullif(trim(p_title), ''), p_fingerprint), p_type)
  on conflict (user_id, fingerprint) do update
    set title = excluded.title,
        type = excluded.type;

  select * into v_existing
  from public.reading_progress
  where user_id = v_user_id and fingerprint = p_fingerprint
  for update;

  if not found then
    insert into public.reading_progress (
      user_id, fingerprint, progress_pct, current_page, total_pages, cfi, is_read, rating
    ) values (
      v_user_id, p_fingerprint, v_progress_pct, v_current_page, p_total_pages,
      p_cfi, coalesce(p_is_read, false), p_rating
    );
    return;
  end if;

  update public.reading_progress
  set
    progress_pct = case
      when v_progress_pct > v_existing.progress_pct then v_progress_pct
      else v_existing.progress_pct
    end,
    current_page = case
      when v_progress_pct > v_existing.progress_pct
        or (v_progress_pct = v_existing.progress_pct and v_current_page >= v_existing.current_page)
      then v_current_page else v_existing.current_page
    end,
    total_pages = case
      when v_progress_pct > v_existing.progress_pct
        or (v_progress_pct = v_existing.progress_pct and v_current_page >= v_existing.current_page)
      then p_total_pages else v_existing.total_pages
    end,
    cfi = case
      when v_progress_pct > v_existing.progress_pct
        or (v_progress_pct = v_existing.progress_pct and v_current_page >= v_existing.current_page)
      then p_cfi else v_existing.cfi
    end,
    is_read = coalesce(p_is_read, false),
    rating = case when p_rating_changed then p_rating else v_existing.rating end,
    rating_updated_at = case when p_rating_changed then now() else v_existing.rating_updated_at end
  where id = v_existing.id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.sync_items enable row level security;
alter table public.reading_progress enable row level security;
alter table public.user_lists enable row level security;
alter table public.list_memberships enable row level security;

-- Revoga o acesso implícito e concede somente ao usuário autenticado, após RLS.
revoke all on table public.profiles, public.sync_items, public.reading_progress,
  public.user_lists, public.list_memberships from anon;
grant select, insert, update, delete on table public.profiles, public.sync_items,
  public.reading_progress, public.user_lists, public.list_memberships to authenticated;
revoke execute on function public.set_sync_updated_at() from public, anon, authenticated;
revoke execute on function public.merge_reading_progress(
  text, text, text, double precision, integer, integer, text, boolean, smallint, boolean
) from public, anon;
grant execute on function public.merge_reading_progress(
  text, text, text, double precision, integer, integer, text, boolean, smallint, boolean
) to authenticated;

create policy "profiles: owner select" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "profiles: owner insert" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "profiles: owner update" on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles: owner delete" on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "sync_items: owner select" on public.sync_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "sync_items: owner insert" on public.sync_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "sync_items: owner update" on public.sync_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sync_items: owner delete" on public.sync_items for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "reading_progress: owner select" on public.reading_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "reading_progress: owner insert" on public.reading_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "reading_progress: owner update" on public.reading_progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reading_progress: owner delete" on public.reading_progress for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_lists: owner select" on public.user_lists for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "user_lists: owner insert" on public.user_lists for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "user_lists: owner update" on public.user_lists for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_lists: owner delete" on public.user_lists for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "list_memberships: owner select" on public.list_memberships for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "list_memberships: owner insert" on public.list_memberships for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "list_memberships: owner update" on public.list_memberships for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "list_memberships: owner delete" on public.list_memberships for delete to authenticated
  using ((select auth.uid()) = user_id);
