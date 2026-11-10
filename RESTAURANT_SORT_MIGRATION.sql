-- Run once in Supabase > SQL Editor to enable manual restaurant ordering.
-- Existing restaurants remain unranked (0) until a storefront position is assigned.

alter table public.restaurants
  add column if not exists sort_order integer not null default 0;

create index if not exists restaurants_market_sort_idx
  on public.restaurants (market_code, sort_order, name);

notify pgrst, 'reload schema';
