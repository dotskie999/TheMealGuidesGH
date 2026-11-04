alter table public.restaurants
  add column if not exists timezone text,
  add column if not exists weekly_hours jsonb,
  add column if not exists orders_paused boolean not null default false,
  add column if not exists pause_message text;

update public.restaurants
set timezone = case when market_code like 'gh-%' then 'Africa/Accra' else 'Asia/Manila' end
where timezone is null;

comment on column public.restaurants.weekly_hours is
  'JSON object keyed 0-6 (Sunday-Saturday), each containing closed, open, close, break_enabled, break_start, and break_end.';
