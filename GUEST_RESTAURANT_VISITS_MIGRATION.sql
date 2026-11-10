-- Run once in Supabase > SQL Editor.
-- Tracks every restaurant a consented guest opens, even when no order is placed.
-- The restaurant editor prerequisite is included because older Ghana databases
-- may have restaurant hours installed without the storefront sort column.

alter table public.restaurants
  add column if not exists sort_order integer not null default 0;

create index if not exists restaurants_market_sort_idx
  on public.restaurants (market_code, sort_order, name);

create table if not exists public.guest_restaurant_visits (
  guest_id uuid not null references public.guests(guest_id) on delete cascade,
  restaurant_id text not null references public.restaurants(restaurant_id) on delete cascade,
  first_visited_at timestamptz not null default now(),
  last_visited_at timestamptz not null default now(),
  visit_count integer not null default 1 check (visit_count > 0),
  primary key (guest_id, restaurant_id)
);

create index if not exists guest_restaurant_visits_restaurant_idx
  on public.guest_restaurant_visits (restaurant_id, last_visited_at desc);

create index if not exists guest_restaurant_visits_guest_idx
  on public.guest_restaurant_visits (guest_id, last_visited_at desc);

alter table public.guest_restaurant_visits enable row level security;
revoke all on table public.guest_restaurant_visits from anon, authenticated;
grant all on table public.guest_restaurant_visits to service_role;

notify pgrst, 'reload schema';
