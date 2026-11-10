-- Recommend a title to someone on Show Tracker who isn't your friend yet.
-- It waits here, alongside your friend request, and becomes a normal
-- recommendation the moment you become friends (however that happens).

create table public.pending_recommendations (
  from_id uuid not null references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  title_id text not null references public.titles on delete cascade,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id, title_id),
  check (from_id <> to_id)
);
create index pending_recommendations_to_idx on public.pending_recommendations (to_id);

alter table public.pending_recommendations enable row level security;

-- The sender manages these; the recipient can see them next to the friend request.
create policy "see pending recommendations you sent or got" on public.pending_recommendations
  for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());
create policy "queue recommendations you send" on public.pending_recommendations
  for insert to authenticated with check (from_id = auth.uid());
create policy "cancel pending recommendations you sent" on public.pending_recommendations
  for delete to authenticated using (from_id = auth.uid());

grant select, insert, delete on public.pending_recommendations to authenticated;
grant select, delete on public.pending_recommendations to service_role;

create function public.deliver_pending_recommendations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.recommendations (from_id, to_id, title_id, note)
  select p.from_id, p.to_id, p.title_id, p.note
  from public.pending_recommendations p
  where (p.from_id = new.user_a and p.to_id = new.user_b)
     or (p.from_id = new.user_b and p.to_id = new.user_a)
  on conflict (from_id, to_id, title_id) do nothing;

  delete from public.pending_recommendations p
  where (p.from_id = new.user_a and p.to_id = new.user_b)
     or (p.from_id = new.user_b and p.to_id = new.user_a);
  return new;
end;
$$;

revoke execute on function public.deliver_pending_recommendations() from public, anon, authenticated;

create trigger deliver_pending_recommendations
  after insert on public.friendships
  for each row execute function public.deliver_pending_recommendations();
