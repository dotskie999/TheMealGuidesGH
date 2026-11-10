-- Consolidate the original Accra and Tema launch markets into one Greater Accra market.
-- Safe to run more than once. Legacy non-Ghana rows remain untouched but are
-- inaccessible to this application; archive them separately if they still exist.

begin;

alter table public.restaurants drop constraint if exists restaurants_market_code_check;
alter table public.guests drop constraint if exists guests_market_code_check;
alter table public.orders drop constraint if exists orders_market_code_check;

alter table public.restaurants
  add column if not exists market_code text not null default 'gh-greater-accra';
alter table public.guests
  add column if not exists market_code text not null default 'gh-greater-accra',
  add column if not exists country_code text not null default 'GH';
alter table public.orders
  add column if not exists market_code text not null default 'gh-greater-accra',
  add column if not exists country_code text not null default 'GH',
  add column if not exists currency_code text not null default 'GHS';

alter table public.restaurants alter column market_code set default 'gh-greater-accra';
alter table public.guests alter column market_code set default 'gh-greater-accra';
alter table public.guests alter column country_code set default 'GH';
alter table public.orders alter column market_code set default 'gh-greater-accra';
alter table public.orders alter column country_code set default 'GH';
alter table public.orders alter column currency_code set default 'GHS';

update public.restaurants
set market_code = 'gh-greater-accra'
where market_code in ('gh-accra', 'gh-tema');

update public.guests
set market_code = 'gh-greater-accra'
where market_code in ('gh-accra', 'gh-tema');

update public.orders
set market_code = 'gh-greater-accra'
where market_code in ('gh-accra', 'gh-tema');

alter table public.restaurants add constraint restaurants_market_code_check
  check (market_code = 'gh-greater-accra') not valid;
alter table public.guests add constraint guests_market_code_check
  check (market_code = 'gh-greater-accra') not valid;
alter table public.orders add constraint orders_market_code_check
  check (market_code = 'gh-greater-accra') not valid;

commit;
