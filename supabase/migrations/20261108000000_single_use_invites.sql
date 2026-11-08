-- Invite links work once: the first person to accept uses it up, so a
-- forwarded link can't add strangers. Old reusable links are retired.
alter table public.invites
  add column used_by uuid references public.profiles on delete set null,
  add column used_at timestamptz;

update public.invites set used_at = now() where used_at is null;

drop function public.invite_preview(text);

create function public.invite_preview(invite_code text)
returns table (username text, display_name text, avatar_url text, used boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.display_name, p.avatar_url,
         (i.used_at is not null and i.used_by is distinct from auth.uid()) as used
  from public.invites i
  join public.profiles p on p.id = i.created_by
  where i.code = invite_code and i.expires_at > now();
$$;

create or replace function public.accept_invite(invite_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
  inviter_username text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select i.created_by, i.used_by, i.used_at into inv
  from public.invites i
  where i.code = invite_code and i.expires_at > now()
  for update;
  if not found then
    raise exception 'This invite link has expired or does not exist';
  end if;
  if inv.used_at is not null and inv.used_by is distinct from auth.uid() then
    raise exception 'This invite link has already been used';
  end if;
  select username into inviter_username from public.profiles where id = inv.created_by;
  if inv.created_by <> auth.uid() then
    perform public.make_friends(auth.uid(), inv.created_by);
    update public.invites set used_by = auth.uid(), used_at = now() where code = invite_code;
  end if;
  return inviter_username;
end;
$$;

revoke execute on function public.invite_preview(text), public.accept_invite(text) from public, anon;
grant execute on function public.invite_preview(text), public.accept_invite(text) to authenticated;
