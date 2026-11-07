import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import {
  acceptFriendRequest,
  createInvite,
  deleteFriendRequest,
  removeFriend,
} from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { CopyInvite } from "@/components/CopyInvite";
import { PersonAction, type Relation } from "@/components/PersonAction";
import { Card, Empty, PageTitle, Skeleton } from "@/components/Section";
import { getMe } from "@/lib/auth";
import { listFriends } from "@/lib/friends";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";

export const metadata = { title: "Friends" };

export default function FriendsPage({ searchParams }: PageProps<"/friends">) {
  return (
    <>
      <PageTitle>Friends</PageTitle>
      <Suspense fallback={<Skeleton rows={5} />}>
        <Friends searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type PersonResult = ProfileRow & { relation: Relation };

type RequestRow = {
  from_id: string;
  to_id: string;
  from: ProfileRow;
  to: ProfileRow;
};

async function Friends({ searchParams }: Pick<PageProps<"/friends">, "searchParams">) {
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim().slice(0, 50) : "";
  const me = await getMe();
  const supabase = await createClient();
  const [friends, { data: requestData }, { data: invite }, { data: found }] = await Promise.all([
    listFriends(me.id),
    supabase
      .from("friend_requests")
      .select(
        "from_id, to_id, from:profiles!friend_requests_from_id_fkey(id, username, display_name, avatar_url), to:profiles!friend_requests_to_id_fkey(id, username, display_name, avatar_url)"
      )
      .order("created_at", { ascending: false }),
    currentInvite(me.id),
    q.length >= 2 ? supabase.rpc("search_people", { query: q }) : Promise.resolve({ data: null }),
  ]);
  const people = (found ?? []) as PersonResult[];
  const requests = (requestData ?? []) as unknown as RequestRow[];
  const incoming = requests.filter((r) => r.to_id === me.id);
  const outgoing = requests.filter((r) => r.from_id === me.id);

  return (
    <>
      <Card title="Invite friends">
        <p className="mb-3 text-sm text-muted">
          Share your invite link. Anyone who opens it and signs in becomes your friend.
        </p>
        {invite ? (
          <CopyInvite code={invite.code} expiresAt={invite.expires_at} />
        ) : (
          <form action={createInvite}>
            <button className="btn-primary">Create invite link</button>
          </form>
        )}
      </Card>

      <Card title="Find people">
        <Form action="/friends" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or username"
            className="input"
            type="search"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button className="btn-secondary shrink-0">Search</button>
        </Form>
        <p className="mt-2 text-xs text-muted">
          Close spellings work too. Your username is{" "}
          <strong className="text-foreground">@{me.username}</strong>.
        </p>
        {q ? (
          people.length === 0 ? (
            <Empty>No one found matching “{q}”.</Empty>
          ) : (
            <ul className="mt-4 space-y-3">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <Link href={`/u/${p.username}`} className="hover:underline">
                    <PersonLabel person={p} />
                  </Link>
                  <div className="ml-auto">
                    <PersonAction meId={me.id} person={p} relation={p.relation} />
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>

      {incoming.length ? (
        <Card title="Friend requests">
          <ul className="space-y-3">
            {incoming.map((r) => (
              <li key={r.from_id} className="flex items-center gap-3">
                <PersonLabel person={r.from} />
                <form action={acceptFriendRequest.bind(null, r.from_id)} className="ml-auto">
                  <button className="btn-primary py-1.5">Accept</button>
                </form>
                <form action={deleteFriendRequest.bind(null, r.from_id, me.id)}>
                  <button className="btn-secondary py-1.5">Decline</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title={`Your friends${friends.length ? ` (${friends.length})` : ""}`}>
        {friends.length === 0 ? (
          <Empty>No friends yet. Send someone your invite link.</Empty>
        ) : (
          <ul className="space-y-3">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center gap-3">
                <Link href={`/u/${f.username}`} className="flex items-center gap-3 hover:underline">
                  <PersonLabel person={f} />
                </Link>
                <form action={removeFriend.bind(null, f.id)} className="ml-auto">
                  <button className="text-xs text-muted underline hover:text-foreground">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {outgoing.length ? (
        <Card title="Waiting on">
          <ul className="space-y-3">
            {outgoing.map((r) => (
              <li key={r.to_id} className="flex items-center gap-3">
                <PersonLabel person={r.to} />
                <form action={deleteFriendRequest.bind(null, me.id, r.to_id)} className="ml-auto">
                  <button className="text-xs text-muted underline hover:text-foreground">Cancel</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

// Your newest invite link, if it has at least a day left.
async function currentInvite(meId: string) {
  const supabase = await createClient();
  const cutoff = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  return supabase
    .from("invites")
    .select("code, expires_at")
    .eq("created_by", meId)
    .gt("expires_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

function PersonLabel({ person }: { person: ProfileRow }) {
  return (
    <span className="flex items-center gap-3">
      <Avatar name={person.display_name} url={person.avatar_url} size={36} />
      <span>
        <span className="block text-sm font-medium">{person.display_name}</span>
        <span className="block text-xs text-muted">@{person.username}</span>
      </span>
    </span>
  );
}
