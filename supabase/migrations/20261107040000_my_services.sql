-- Streaming services each person subscribes to (TMDB provider ids).
alter table public.profiles
  add column services integer[] not null default '{}'
  check (cardinality(services) <= 60);

grant update (services) on public.profiles to authenticated;
