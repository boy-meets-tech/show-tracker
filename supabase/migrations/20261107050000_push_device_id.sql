-- One notification registration per device: each device sends a random id it
-- keeps locally, and saving a new registration replaces that device's old one.
alter table public.push_subscriptions add column device_id text
  check (device_id ~ '^[A-Za-z0-9-]{8,64}$');
create index push_subscriptions_device_idx on public.push_subscriptions (user_id, device_id);

drop function public.save_push_subscription(text, text, text);

create function public.save_push_subscription(
  sub_endpoint text,
  sub_p256dh text,
  sub_auth text,
  sub_device text default null
)
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
  if sub_device is not null and sub_device !~ '^[A-Za-z0-9-]{8,64}$' then
    sub_device := null;
  end if;
  -- Drop this device's older registrations (the browser replaced them).
  if sub_device is not null then
    delete from public.push_subscriptions
    where user_id = auth.uid() and device_id = sub_device and endpoint <> sub_endpoint;
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, device_id)
  values (sub_endpoint, auth.uid(), sub_p256dh, sub_auth, sub_device)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        device_id = coalesce(excluded.device_id, public.push_subscriptions.device_id),
        created_at = now();
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
