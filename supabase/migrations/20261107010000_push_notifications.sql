-- Phone push notifications.

-- One row per device that turned notifications on.
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Which kinds of notification each person wants. No row means all on.
create table public.notification_settings (
  user_id uuid primary key default auth.uid() references public.profiles on delete cascade,
  friend_requests boolean not null default true,
  recommendations boolean not null default true,
  friend_activity boolean not null default true,
  friend_loved boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Server-only secrets (the push signing keys). No policies, so only the
-- service role can read it.
create table public.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_settings enable row level security;
alter table public.app_secrets enable row level security;

create policy "see own devices" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "remove own devices" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

create policy "see own settings" on public.notification_settings
  for select to authenticated using (user_id = auth.uid());
create policy "create own settings" on public.notification_settings
  for insert to authenticated with check (user_id = auth.uid());
create policy "change own settings" on public.notification_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Save this device for the signed-in user. A shared device moves to whoever
-- turned notifications on last.
create function public.save_push_subscription(sub_endpoint text, sub_p256dh text, sub_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if sub_endpoint !~ '^https://' then
    raise exception 'Invalid push endpoint';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (sub_endpoint, auth.uid(), sub_p256dh, sub_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

revoke all on public.push_subscriptions, public.notification_settings, public.app_secrets from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select, insert, update on public.notification_settings to authenticated;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
