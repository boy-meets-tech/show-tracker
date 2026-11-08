"use client";

import { useActionState, useRef, useState } from "react";
import { recommend, type ActionState } from "@/app/actions";
import { track } from "@/lib/analytics";
import { normalize, similarity } from "@/lib/fuzzy";
import { Avatar } from "./Avatar";

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

export function RecommendForm({ titleId, friends }: { titleId: string; friends: Friend[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recommend.bind(null, titleId),
    null
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const countSelected = () =>
    setSelected(formRef.current?.querySelectorAll('input[name="friend"]:checked').length ?? 0);

  const visible = friends.filter((f) => matches(f, query));
  const showSearch = friends.length > 1;

  return (
    <form
      ref={formRef}
      action={action}
      onChange={countSelected}
      onReset={() => {
        // The form clears itself after sending.
        setSelected(0);
        setQuery("");
      }}
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        track("recommendation_sent", {
          friends: data.getAll("friend").length,
          with_note: String(data.get("note") ?? "").trim().length > 0,
        });
      }}
      className="space-y-3"
    >
      {showSearch ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter shouldn't send the recommendation from the search box.
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder="Search your friends"
          aria-label="Search your friends"
          autoCapitalize="none"
          autoCorrect="off"
          className="input"
        />
      ) : null}

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
          <p className="text-sm text-muted">No friends match &ldquo;{query}&rdquo;.</p>
        ) : null}
      </div>
      {selected > 0 ? (
        <p className="text-xs text-muted">
          {selected} friend{selected === 1 ? "" : "s"} selected
        </p>
      ) : null}

      <textarea
        name="note"
        maxLength={280}
        rows={2}
        placeholder="Why they'd love it (optional)"
        className="input"
      />
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send recommendation"}
        </button>
        {state?.ok ? <span className="text-sm text-green-600">{state.ok}</span> : null}
        {state?.error ? <span className="text-sm text-red-500">{state.error}</span> : null}
      </div>
    </form>
  );
}
