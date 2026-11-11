-- 1. "Who told you?": save recommendations that happened outside the app.
--    A friend on Show Tracker becomes a real recommendation from them (they
--    get credit). Anyone else is saved by name, and can be invited with a
--    link: when they join, it turns into a real recommendation from them.
-- 2. Taste stats: how often someone's recommendations land, for friends to see.

-- Recommendations you logged yourself ("Sam told me about it").
alter table public.recommendations
  add column logged_by_recipient boolean not null default false;

-- Invite links made for one named person (kept apart from your main link).
alter table public.invites
  add column for_name text check (char_length(for_name) between 1 and 60);

create table public.told_me (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title_id text not null references public.titles on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  note text check (char_length(note) <= 280),
  invite text references public.invites (code) on delete set null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);
create unique index told_me_unique_idx on public.told_me (user_id, title_id, lower(trim(name)));
create index told_me_invite_idx on public.told_me (invite);

alter table public.told_me enable row level security;
create policy "manage who told you" on public.told_me
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.told_me to authenticated;

-- A friend told you about a title: record it as their recommendation to you.
create function public.log_told_by_friend(p_title text, p_friend uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  added int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.are_friends(auth.uid(), p_friend) then
    raise exception 'You can only pick friends';
  end if;
  insert into public.recommendations (from_id, to_id, title_id, note, logged_by_recipient)
  values (p_friend, auth.uid(), p_title, nullif(left(trim(p_note), 280), ''), true)
  on conflict (from_id, to_id, title_id) do nothing;
  get diagnostics added = row_count;
  return added > 0;
end;
$$;
revoke execute on function public.log_told_by_friend(text, uuid, text) from public, anon;
grant execute on function public.log_told_by_friend(text, uuid, text) to authenticated;

-- The invite page can greet the person by name.
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
  note text,
  for_name text,
  told_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.display_name, p.avatar_url,
         (i.used_at is not null and i.used_by is distinct from auth.uid()) as used,
         t.id, t.name, t.poster_path, t.media_type, t.year, i.note, i.for_name,
         (select tt.name from public.told_me tm join public.titles tt on tt.id = tm.title_id
          where tm.invite = i.code order by tm.created_at limit 1)
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
    -- They told the inviter about shows before joining: those become theirs.
    insert into public.recommendations (from_id, to_id, title_id, note, logged_by_recipient, created_at)
    select auth.uid(), tm.user_id, tm.title_id, tm.note, true, tm.created_at
    from public.told_me tm
    where tm.invite = invite_code and tm.user_id = inv.created_by
    on conflict (from_id, to_id, title_id) do nothing;
    delete from public.told_me tm where tm.invite = invite_code and tm.user_id = inv.created_by;
  end if;
  return inviter_username;
end;
$$;

revoke execute on function public.invite_preview(text), public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- How someone's recommendations landed: a "hit" is one they finished or rated 8+.
-- Only for yourself and your friends.
create function public.taste_stats(people uuid[])
returns table (user_id uuid, sent integer, started integer, hits integer, avg_rating numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         count(r.id)::int,
         count(e.user_id) filter (where e.status <> 'want')::int,
         count(e.user_id) filter (where e.status = 'finished' or (e.status <> 'want' and e.rating >= 8))::int,
         round(avg(e.rating) filter (where e.status <> 'want'), 1)
  from unnest(people) as p(id)
  left join public.recommendations r on r.from_id = p.id
  left join public.watch_entries e on e.user_id = r.to_id and e.title_id = r.title_id
  where p.id = auth.uid() or public.are_friends(auth.uid(), p.id)
  group by p.id;
$$;
revoke execute on function public.taste_stats(uuid[]) from public, anon;
grant execute on function public.taste_stats(uuid[]) to authenticated;

-- Push notifications read recommendation outcomes with the secret key.
grant select on public.recommendations, public.watch_entries to service_role;
