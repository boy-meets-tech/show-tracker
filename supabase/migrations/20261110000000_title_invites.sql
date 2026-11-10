-- Recommend a title to someone who isn't on the app yet: an invite link can
-- carry a title and a note. Opening it shows the recommendation (even before
-- signing in); accepting it makes you friends and delivers the recommendation.
alter table public.invites
  add column title_id text references public.titles on delete set null,
  add column note text check (char_length(note) <= 280);

drop function public.invite_preview(text);

create function public.invite_preview(invite_code text)
returns table (
  username text,
  display_name text,
  avatar_url text,
  used boolean,
  title_id text,
  title_name text,
  title_poster text,
  title_media text,
  title_year integer,
  note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.display_name, p.avatar_url,
         (i.used_at is not null and i.used_by is distinct from auth.uid()) as used,
         t.id, t.name, t.poster_path, t.media_type, t.year, i.note
  from public.invites i
  join public.profiles p on p.id = i.created_by
  left join public.titles t on t.id = i.title_id
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
  select i.created_by, i.used_by, i.used_at, i.title_id, i.note into inv
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
    if inv.title_id is not null then
      insert into public.recommendations (from_id, to_id, title_id, note)
      values (inv.created_by, auth.uid(), inv.title_id, inv.note)
      on conflict (from_id, to_id, title_id) do nothing;
    end if;
  end if;
  return inviter_username;
end;
$$;

revoke execute on function public.invite_preview(text), public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
-- The preview is shown to people who aren't signed up yet; it only reveals
-- the inviter's name and the recommended title, to whoever has the code.
grant execute on function public.invite_preview(text) to anon, authenticated;
