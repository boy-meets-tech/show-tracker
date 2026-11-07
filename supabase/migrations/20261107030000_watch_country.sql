-- Country used for "Where to watch". Null means detect it from the device.
alter table public.profiles
  add column country text check (country ~ '^[A-Z]{2}$');

grant update (country) on public.profiles to authenticated;
