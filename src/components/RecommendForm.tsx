"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  findPeople,
  recommend,
  recommendToNewFriend,
  type ActionState,
  type PersonMatch,
} from "@/app/actions";
import { track } from "@/lib/analytics";
import { normalize, similarity } from "@/lib/fuzzy";
import { Avatar } from "./Avatar";
import { SendToNew } from "./SendToNew";

type Friend = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  alreadySent: boolean;
  hasLogged: boolean;
};

// Matches on name or username, ignoring case, accents and small typos.
function matches(friend: Friend, query: string) {
  const q = normalize(query.replace(/^@/, ""));
  if (!q) return true;
  const name = normalize(friend.display_name);
  const username = normalize(friend.username);
  return (
    name.includes(q) ||
    username.includes(q) ||
    similarity(q, friend.display_name) >= 0.6 ||
    similarity(q, friend.username) >= 0.6
  );
}

// One place to recommend a title to anyone: friends (tick and send), people on
// Show Tracker who aren't friends yet (friend request + recommendation), and
// people who aren't on Show Tracker (a link to text them).
export function RecommendForm({
  titleId,
  titleName,
  friends,
}: {
  titleId: string;
  titleName: string;
  friends: Friend[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recommend.bind(null, titleId),
    null
  );
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState(0);
  const [people, setPeople] = useState<{ query: string; results: PersonMatch[] }>({ query: "", results: [] });
  const formRef = useRef<HTMLFormElement>(null);

  const countSelected = () =>
    setSelected(formRef.current?.querySelectorAll('input[name="friend"]:checked').length ?? 0);

  const visible = friends.filter((f) => matches(f, query));
  const trimmed = query.trim();
  const searching = trimmed.replace(/^@/, "").length >= 2;

  // Look for people on Show Tracker who aren't friends yet, as you type.
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await findPeople(trimmed).catch(() => []);
      if (!cancelled) setPeople({ query: trimmed, results });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, searching]);

  const others = searching && people.query === trimmed ? people.results : [];
  const lookingUp = searching && people.query !== trimmed;

  return (
    <div className="space-y-3">
      <form
        ref={formRef}
        action={action}
        onChange={countSelected}
        onReset={() => {
          // The form clears itself after sending.
          setSelected(0);
          setQuery("");
          setNote("");
        }}
        onSubmit={(e) => {
          const data = new FormData(e.currentTarget);
          track("recommendation_sent", {
            friends: data.getAll("friend").length,
            with_note: note.trim().length > 0,
          });
        }}
        className="space-y-3"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter shouldn't send the recommendation from the search box.
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder={friends.length ? "Who's it for? Search friends or anyone" : "Who's it for? Search by name"}
          aria-label="Who's it for?"
          autoCapitalize="none"
          autoCorrect="off"
          className="input"
        />

        {friends.length ? (
          <div className="flex flex-wrap gap-2">
            {friends.map((f) => {
              // Hidden, not removed, so friends you've ticked stay ticked while you search.
              const shown = visible.includes(f);
              return (
                <label
                  key={f.id}
                  className={`cursor-pointer items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-sm has-checked:border-accent has-checked:bg-accent-soft ${
                    shown ? "flex" : "hidden has-checked:flex"
                  } ${f.alreadySent ? "opacity-50" : ""}`}
                  title={f.alreadySent ? "Already recommended" : f.hasLogged ? "Already logged this" : undefined}
                >
                  <input type="checkbox" name="friend" value={f.id} className="sr-only" disabled={f.alreadySent} />
                  <Avatar name={f.display_name} url={f.avatar_url} size={24} />
                  <span className="ph-mask">{f.display_name}</span>
                  {f.alreadySent ? " ✓" : ""}
                </label>
              );
            })}
            {visible.length === 0 ? (
              <p className="text-sm text-muted">None of your friends match &ldquo;{trimmed}&rdquo;.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No friends yet. Search for someone on Show Tracker, or send a link to anyone.
          </p>
        )}

        {others.length ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted">On Show Tracker, not friends yet</p>
            <ul className="space-y-2">
              {others.map((p) => (
                <NewFriendRow key={p.id} person={p} titleId={titleId} note={note} />
              ))}
            </ul>
          </div>
        ) : lookingUp ? (
          <p className="text-xs text-muted">Looking for others on Show Tracker…</p>
        ) : null}

        <textarea
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          rows={2}
          placeholder="Why they'd love it (optional)"
          className="input"
        />

        {friends.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={pending || selected === 0}>
              {pending
                ? "Sending…"
                : selected > 1
                  ? `Send to ${selected} friends`
                  : "Send recommendation"}
            </button>
            {state?.ok ? <span className="text-sm text-green-600">{state.ok}</span> : null}
            {state?.error ? <span className="text-sm text-red-500">{state.error}</span> : null}
          </div>
        ) : null}
      </form>

      <SendToNew
        titleId={titleId}
        titleName={titleName}
        note={note}
        name={searching && visible.length === 0 && others.length === 0 && !lookingUp ? trimmed : undefined}
      />
    </div>
  );
}

function NewFriendRow({ person, titleId, note }: { person: PersonMatch; titleId: string; note: string }) {
  const [result, setResult] = useState<ActionState>(null);
  const [busy, start] = useTransition();
  const label =
    person.relation === "received"
      ? "Accept & recommend"
      : person.relation === "sent"
        ? "Recommend"
        : "Add friend & recommend";

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <Avatar name={person.display_name} url={person.avatar_url} size={28} />
      <span className="min-w-0">
        <span className="ph-mask block font-medium">{person.display_name}</span>
        <span className="ph-mask block text-xs text-muted">
          @{person.username}
          {person.relation === "sent" ? " · request pending" : person.relation === "received" ? " · asked to be friends" : ""}
        </span>
      </span>
      {result?.ok ? (
        <span className="ml-auto text-xs text-green-600">{result.ok}</span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            start(async () => {
              track("recommendation_sent_new_friend", { relation: person.relation });
              setResult(await recommendToNewFriend(titleId, person.username, note));
            })
          }
          className="btn-secondary ml-auto py-1.5"
        >
          {busy ? "Sending…" : label}
        </button>
      )}
      {result?.error ? <p className="w-full text-xs text-red-500">{result.error}</p> : null}
    </li>
  );
}
