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
import { getMe, getMyId } from "@/lib/auth";
import { listFriends } from "@/lib/friends";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/types";
import { SubmitButton } from "@/components/SubmitButton";

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
  const myId = await getMyId();
  const supabase = await createClient();
  const [me, friends, { data: requestData }, { data: invite }, { data: found }] = await Promise.all([
    getMe(),
    listFriends(myId),
    supabase
      .from("friend_requests")
      .select(
        "from_id, to_id, from:profiles!friend_requests_from_id_fkey(id, username, display_name, avatar_url), to:profiles!friend_requests_to_id_fkey(id, username, display_name, avatar_url)"
      )
      .order("created_at", { ascending: false }),
    currentInvite(myId),
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
          Each link works for one person: whoever opens it first and accepts becomes your friend.
          Send a new link to each friend.
        </p>
        {invite ? (
          <>
            <CopyInvite code={invite.code} expiresAt={invite.expires_at} />
            <form action={createInvite} className="mt-2">
              <SubmitButton
                className="inline-flex items-center gap-1.5 text-xs text-muted underline hover:text-foreground"
                pendingText="Making a new link…"
                event="invite_link_created"
              >
                Make a new link (the current one stops working)
              </SubmitButton>
            </form>
          </>
        ) : (
          <form action={createInvite}>
            <SubmitButton pendingText="Creating…" event="invite_link_created">Create invite link</SubmitButton>
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
          <SubmitButton className="btn-secondary shrink-0" pendingText="Searching…" event="people_searched">Search</SubmitButton>
        </Form>
        <p className="mt-2 text-xs text-muted">
          Close spellings work too. Your username is{" "}
          <strong className="ph-mask text-foreground">@{me.username}</strong>.
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
                  <SubmitButton className="btn-primary py-1.5" event="friend_request_accepted">Accept</SubmitButton>
                </form>
                <form action={deleteFriendRequest.bind(null, r.from_id, me.id)}>
                  <SubmitButton className="btn-secondary py-1.5">Decline</SubmitButton>
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
                  <SubmitButton className="inline-flex items-center gap-1.5 text-xs text-muted underline hover:text-foreground">Remove</SubmitButton>
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
                  <SubmitButton className="inline-flex items-center gap-1.5 text-xs text-muted underline hover:text-foreground">Cancel</SubmitButton>
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
  const query = () =>
    supabase
      .from("invites")
      .select("code, expires_at")
      .eq("created_by", meId)
      .gt("expires_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1);
  // Links made for recommending a title to someone new aren't shown here.
  const result = await query().is("used_at", null).is("title_id", null).maybeSingle();
  // Before the database updates these columns don't exist (error 42703).
  if (result.error?.code !== "42703") return result;
  const unused = await query().is("used_at", null).maybeSingle();
  return unused.error?.code === "42703" ? query().maybeSingle() : unused;
}

function PersonLabel({ person }: { person: ProfileRow }) {
  return (
    <span className="flex items-center gap-3">
      <Avatar name={person.display_name} url={person.avatar_url} size={36} />
      <span>
        <span className="ph-mask block text-sm font-medium">{person.display_name}</span>
        <span className="ph-mask block text-xs text-muted">@{person.username}</span>
      </span>
    </span>
  );
}
