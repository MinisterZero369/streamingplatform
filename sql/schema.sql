-- SCENEZ STREAM / SUPABASE SETUP
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('viewer','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.content_type as enum ('movie','episode','clip');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role public.user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text default '',
  content_type public.content_type not null default 'movie',
  cloudflare_uid text unique,
  poster_url text,
  backdrop_url text,
  trailer_url text,
  duration_seconds integer default 0,
  release_year integer,
  maturity_rating text,
  genre text[] not null default '{}',
  featured boolean not null default false,
  published boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table if not exists public.watch_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  position_seconds numeric not null default 0,
  duration_seconds numeric not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists videos_updated_at on public.videos;
create trigger videos_updated_at before update on public.videos
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.favorites enable row level security;
alter table public.watch_progress enable row level security;

-- Profiles
create policy "users read own profile" on public.profiles for select to authenticated
using (id = auth.uid());
create policy "users update own profile" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- Videos: anybody can browse published catalog; admins manage all.
create policy "published videos public read" on public.videos for select to anon, authenticated
using (published = true or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admins insert videos" on public.videos for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admins update videos" on public.videos for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admins delete videos" on public.videos for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Favorites
create policy "users read favorites" on public.favorites for select to authenticated using (user_id = auth.uid());
create policy "users add favorites" on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy "users delete favorites" on public.favorites for delete to authenticated using (user_id = auth.uid());

-- Watch progress
create policy "users read progress" on public.watch_progress for select to authenticated using (user_id = auth.uid());
create policy "users add progress" on public.watch_progress for insert to authenticated with check (user_id = auth.uid());
create policy "users update progress" on public.watch_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Explicit Data API grants; RLS still controls rows.
grant usage on schema public to anon, authenticated;
grant select on public.videos to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update on public.watch_progress to authenticated;
grant insert, update, delete on public.videos to authenticated;

-- AFTER you create your own account, make yourself admin by replacing the email:
-- update public.profiles set role='admin'
-- where id = (select id from auth.users where email='you@example.com');
