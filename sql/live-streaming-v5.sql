-- Scenez Stream v5: Live Studio settings
-- Run this ONCE in Supabase SQL Editor after your original schema.sql.

create table if not exists public.live_settings (
  id smallint primary key default 1 check (id = 1),
  live_input_uid text,
  title text not null default 'Scenez Live',
  description text not null default 'Streaming live now on Scenez.',
  hero_image_url text,
  auto_takeover boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.live_settings enable row level security;

drop policy if exists "Live settings are publicly readable" on public.live_settings;
create policy "Live settings are publicly readable"
on public.live_settings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert live settings" on public.live_settings;
create policy "Admins can insert live settings"
on public.live_settings for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Admins can update live settings" on public.live_settings;
create policy "Admins can update live settings"
on public.live_settings for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

grant select on public.live_settings to anon, authenticated;
grant insert, update on public.live_settings to authenticated;

insert into public.live_settings (id)
values (1)
on conflict (id) do nothing;
