-- Run this script once in your Supabase SQL Editor (https://supabase.com/dashboard -> SQL Editor)
-- to create the cloud sync table with Row-Level Security (RLS) so only you can access your shows.

create table if not exists public.user_watchlists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shows jsonb not null default '[]'::jsonb,
  activity jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_watchlists enable row level security;

create policy "Users can view their own watchlist"
  on public.user_watchlists for select
  using (auth.uid() = user_id);

create policy "Users can insert their own watchlist"
  on public.user_watchlists for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own watchlist"
  on public.user_watchlists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
