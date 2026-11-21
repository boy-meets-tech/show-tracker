-- "Watch together?": ask a friend to watch a title with you; they answer
-- I'm in / Not this one.

create table public.watch_together (
  from_id uuid not null default auth.uid() references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  title_id text not null references public.titles on delete cascade,
  status text not null default 'asked' check (status in ('asked', 'in', 'out')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (from_id, to_id, title_id),
  check (from_id <> to_id)
);
create index watch_together_to_idx on public.watch_together (to_id);

alter table public.watch_together enable row level security;

create policy "see plans you're in" on public.watch_together
  for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());
create policy "ask friends" on public.watch_together
  for insert to authenticated
  with check (from_id = auth.uid() and status = 'asked' and public.are_friends(from_id, to_id));
create policy "answer when asked" on public.watch_together
  for update to authenticated using (to_id = auth.uid()) with check (to_id = auth.uid());
create policy "cancel your ask" on public.watch_together
  for delete to authenticated using (from_id = auth.uid());

-- Only the answer can change; who and what stay fixed.
revoke update on public.watch_together from authenticated;
grant select, insert, delete on public.watch_together to authenticated;
grant update (status, responded_at) on public.watch_together to authenticated;
grant select on public.watch_together to service_role;
