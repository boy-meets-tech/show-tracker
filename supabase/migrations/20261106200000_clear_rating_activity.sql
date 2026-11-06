-- Clearing a rating removes its "rated X/10" feed event.
create or replace function public.log_watch_activity()
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

  if tg_op = 'UPDATE' and new.rating is null and old.rating is not null then
    delete from public.activity
    where user_id = new.user_id and title_id = new.title_id and kind = 'rating';
  elsif new.rating is not null and (tg_op = 'INSERT' or new.rating is distinct from old.rating) then
    delete from public.activity
    where user_id = new.user_id and title_id = new.title_id and kind = 'rating'
      and created_at > now() - interval '10 minutes';
    insert into public.activity (user_id, title_id, kind, rating)
    values (new.user_id, new.title_id, 'rating', new.rating);
  end if;

  return new;
end;
$$;

-- Clean up rating events left behind by ratings that were already cleared.
delete from public.activity a
where a.kind = 'rating'
  and not exists (
    select 1 from public.watch_entries e
    where e.user_id = a.user_id and e.title_id = a.title_id and e.rating is not null
  );
