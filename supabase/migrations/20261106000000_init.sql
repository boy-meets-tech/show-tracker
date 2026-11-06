-- Show Tracker: initial schema.
-- Everything a user logs is visible only to themselves and their friends.

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, created automatically on sign-up)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  attempts int := 0;
begin
  base := left(lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-zA-Z0-9_]', '', 'g')), 15);
  if char_length(base) < 3 then
    base := 'user' || base;
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    attempts := attempts + 1;
    if attempts > 20 then
      candidate := 'user' || substr(md5(random()::text), 1, 12);
    else
      candidate := base || floor(random() * 10000)::int::text;
    end if;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      candidate
    ), 50),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Friendships (stored once per pair, smaller id first)
-- ---------------------------------------------------------------------------
create table public.friendships (
  user_a uuid not null references public.profiles on delete cascade,
  user_b uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_user_b_idx on public.friendships (user_b);

create function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

-- Internal helper: only callable from the security-definer functions below.
create function public.make_friends(a uuid, b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if a = b then
    raise exception 'You cannot friend yourself';
  end if;
  insert into public.friendships (user_a, user_b)
  values (least(a, b), greatest(a, b))
  on conflict do nothing;
  delete from public.friend_requests
  where (from_id = a and to_id = b) or (from_id = b and to_id = a);
end;
$$;

-- ---------------------------------------------------------------------------
-- Friend requests (by username)
-- ---------------------------------------------------------------------------
create table public.friend_requests (
  from_id uuid not null references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create index friend_requests_to_idx on public.friend_requests (to_id);

-- Sends a request, or accepts straight away if they already asked you.
create function public.send_friend_request(target_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select id into target from public.profiles where username = lower(trim(target_username));
  if target is null then
    raise exception 'No one has the username %', target_username;
  end if;
  if target = me then
    raise exception 'That''s you!';
  end if;
  if public.are_friends(me, target) then
    return 'already_friends';
  end if;
  if exists (select 1 from public.friend_requests where from_id = target and to_id = me) then
    perform public.make_friends(me, target);
    return 'accepted';
  end if;
  insert into public.friend_requests (from_id, to_id) values (me, target)
  on conflict do nothing;
  return 'sent';
end;
$$;

create function public.accept_friend_request(requester uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.friend_requests where from_id = requester and to_id = auth.uid()
  ) then
    raise exception 'No such friend request';
  end if;
  perform public.make_friends(auth.uid(), requester);
end;
$$;

-- ---------------------------------------------------------------------------
-- Invite links
-- ---------------------------------------------------------------------------
create table public.invites (
  code text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create index invites_created_by_idx on public.invites (created_by);

-- Who sent this invite (shown on the invite page before accepting).
create function public.invite_preview(invite_code text)
returns table (username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.username, p.display_name, p.avatar_url
  from public.invites i
  join public.profiles p on p.id = i.created_by
  where i.code = invite_code and i.expires_at > now();
$$;

create function public.accept_invite(invite_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inviter uuid;
  inviter_username text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select i.created_by, p.username into inviter, inviter_username
  from public.invites i
  join public.profiles p on p.id = i.created_by
  where i.code = invite_code and i.expires_at > now();
  if inviter is null then
    raise exception 'This invite link has expired or does not exist';
  end if;
  if inviter <> auth.uid() then
    perform public.make_friends(auth.uid(), inviter);
  end if;
  return inviter_username;
end;
$$;

-- ---------------------------------------------------------------------------
-- Titles (TV shows and movies, cached from TMDB)
-- ---------------------------------------------------------------------------
create table public.titles (
  id text primary key check (id ~ '^(tv|movie)-[0-9]+$'),
  media_type text not null check (media_type in ('tv', 'movie')),
  tmdb_id integer not null,
  name text not null,
  poster_path text,
  year integer,
  overview text,
  created_at timestamptz not null default now(),
  check (id = media_type || '-' || tmdb_id)
);

-- ---------------------------------------------------------------------------
-- What each person is watching
-- ---------------------------------------------------------------------------
create type public.watch_status as enum ('watching', 'want', 'finished', 'dropped');

create table public.watch_entries (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title_id text not null references public.titles on delete cascade,
  status public.watch_status not null,
  rating smallint check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id)
);
create index watch_entries_title_idx on public.watch_entries (title_id);

-- ---------------------------------------------------------------------------
-- Activity feed (written by trigger whenever someone updates an entry)
-- ---------------------------------------------------------------------------
create table public.activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  title_id text not null references public.titles on delete cascade,
  kind text not null check (kind in ('status', 'rating')),
  status public.watch_status,
  rating smallint,
  created_at timestamptz not null default now()
);
create index activity_user_created_idx on public.activity (user_id, created_at desc);
create index activity_created_idx on public.activity (created_at desc);

create function public.log_watch_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.activity where user_id = old.user_id and title_id = old.title_id;
    return old;
  end if;

  new.updated_at := now();

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    -- Collapse rapid changes (e.g. clicking through statuses) into one event.
    delete from public.activity
    where user_id = new.user_id and title_id = new.title_id and kind = 'status'
      and created_at > now() - interval '10 minutes';
    insert into public.activity (user_id, title_id, kind, status)
    values (new.user_id, new.title_id, 'status', new.status);
  end if;

  if new.rating is not null and (tg_op = 'INSERT' or new.rating is distinct from old.rating) then
    delete from public.activity
    where user_id = new.user_id and title_id = new.title_id and kind = 'rating'
      and created_at > now() - interval '10 minutes';
    insert into public.activity (user_id, title_id, kind, rating)
    values (new.user_id, new.title_id, 'rating', new.rating);
  end if;

  return new;
end;
$$;

create trigger watch_entries_activity
  before insert or update on public.watch_entries
  for each row execute function public.log_watch_activity();

create trigger watch_entries_activity_delete
  after delete on public.watch_entries
  for each row execute function public.log_watch_activity();

-- ---------------------------------------------------------------------------
-- Recommendations between friends
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id bigint generated always as identity primary key,
  from_id uuid not null default auth.uid() references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  title_id text not null references public.titles on delete cascade,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (from_id, to_id, title_id),
  check (from_id <> to_id)
);
create index recommendations_to_idx on public.recommendations (to_id, created_at desc);

-- Titles your friends rated 8+ that you haven't logged yet.
create function public.friend_picks(max_results integer default 20)
returns table (
  title_id text,
  name text,
  media_type text,
  poster_path text,
  year integer,
  avg_rating numeric,
  friend_count integer,
  friend_names text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id, t.name, t.media_type, t.poster_path, t.year,
    round(avg(e.rating)::numeric, 1),
    count(*)::integer,
    array_agg(p.display_name order by e.rating desc)
  from public.watch_entries e
  join public.titles t on t.id = e.title_id
  join public.profiles p on p.id = e.user_id
  where e.user_id <> auth.uid()
    and e.rating >= 8
    and public.are_friends(auth.uid(), e.user_id)
    and not exists (
      select 1 from public.watch_entries mine
      where mine.user_id = auth.uid() and mine.title_id = e.title_id
    )
  group by t.id
  order by count(*) desc, avg(e.rating) desc, max(e.updated_at) desc
  limit max_results;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.invites enable row level security;
alter table public.titles enable row level security;
alter table public.watch_entries enable row level security;
alter table public.activity enable row level security;
alter table public.recommendations enable row level security;

-- Signed-in users can look each other up (needed to add friends by username).
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "see own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (user_a, user_b));
create policy "unfriend" on public.friendships
  for delete to authenticated using (auth.uid() in (user_a, user_b));

create policy "see own requests" on public.friend_requests
  for select to authenticated using (auth.uid() in (from_id, to_id));
create policy "cancel or decline requests" on public.friend_requests
  for delete to authenticated using (auth.uid() in (from_id, to_id));

create policy "see own invites" on public.invites
  for select to authenticated using (created_by = auth.uid());
create policy "create invites" on public.invites
  for insert to authenticated with check (created_by = auth.uid());
create policy "delete own invites" on public.invites
  for delete to authenticated using (created_by = auth.uid());

create policy "titles readable" on public.titles
  for select to authenticated using (true);
create policy "titles insertable" on public.titles
  for insert to authenticated with check (true);

create policy "see own and friends' entries" on public.watch_entries
  for select to authenticated
  using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));
create policy "add own entries" on public.watch_entries
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own entries" on public.watch_entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own entries" on public.watch_entries
  for delete to authenticated using (user_id = auth.uid());

create policy "see own and friends' activity" on public.activity
  for select to authenticated
  using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));

create policy "see recommendations you sent or got" on public.recommendations
  for select to authenticated using (auth.uid() in (from_id, to_id));
create policy "recommend to friends" on public.recommendations
  for insert to authenticated
  with check (from_id = auth.uid() and public.are_friends(from_id, to_id));
create policy "dismiss recommendations you got" on public.recommendations
  for update to authenticated using (to_id = auth.uid()) with check (to_id = auth.uid());
create policy "unsend recommendations" on public.recommendations
  for delete to authenticated using (from_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants: nothing for anonymous visitors; column limits for updates.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, authenticated, public;

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update on public.profiles from authenticated;
grant update (username, display_name) on public.profiles to authenticated;
revoke update on public.recommendations from authenticated;
grant update (dismissed_at) on public.recommendations to authenticated;
revoke insert, update, delete on public.activity from authenticated;
revoke insert, update on public.friendships from authenticated;
revoke insert, update on public.friend_requests from authenticated;
revoke update on public.titles, public.invites from authenticated;

grant execute on function
  public.are_friends(uuid, uuid),
  public.send_friend_request(text),
  public.accept_friend_request(uuid),
  public.invite_preview(text),
  public.accept_invite(text),
  public.friend_picks(integer)
to authenticated;
