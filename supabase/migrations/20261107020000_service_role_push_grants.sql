-- The server sends notifications with the Supabase secret key (service_role).
-- This project doesn't grant table access to service_role by default, so
-- grant only what the notification code needs.
grant select, insert on public.app_secrets to service_role;
grant select, delete on public.push_subscriptions to service_role;
grant select on public.notification_settings to service_role;
grant select on public.profiles, public.titles, public.friendships, public.watch_entries to service_role;
