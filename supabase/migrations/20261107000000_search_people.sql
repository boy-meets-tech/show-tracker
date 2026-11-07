-- Typo-tolerant people search by name or username.
create extension if not exists pg_trgm with schema extensions;

create function public.search_people(query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  relation text, -- 'friend', 'sent', 'received' or 'none'
  score real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select lower(trim(leading '@' from trim(query))) as q
  ),
  scored as (
    select
      p.id, p.username, p.display_name, p.avatar_url,
      greatest(
        case when starts_with(p.username, q.q) or starts_with(lower(p.display_name), q.q) then 1 else 0 end,
        extensions.similarity(p.username, q.q),
        extensions.similarity(lower(p.display_name), q.q),
        extensions.word_similarity(q.q, lower(p.display_name))
      )::real as score
    from public.profiles p, q
    where p.id <> auth.uid() and char_length(q.q) >= 2
  )
  select
    s.id, s.username, s.display_name, s.avatar_url,
    case
      when public.are_friends(auth.uid(), s.id) then 'friend'
      when exists (select 1 from public.friend_requests r where r.from_id = auth.uid() and r.to_id = s.id) then 'sent'
      when exists (select 1 from public.friend_requests r where r.from_id = s.id and r.to_id = auth.uid()) then 'received'
      else 'none'
    end,
    s.score
  from scored s
  where s.score >= 0.3
  order by s.score desc, s.display_name
  limit 10;
$$;

revoke execute on function public.search_people(text) from public, anon;
grant execute on function public.search_people(text) to authenticated;
