"use client";

import { useActionState } from "react";
import { recommend, type ActionState } from "@/app/actions";
import { track } from "@/lib/analytics";
import { Avatar } from "./Avatar";

type Friend = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  alreadySent: boolean;
  hasLogged: boolean;
};

export function RecommendForm({ titleId, friends }: { titleId: string; friends: Friend[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    recommend.bind(null, titleId),
    null
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        track("recommendation_sent", {
          friends: data.getAll("friend").length,
          with_note: String(data.get("note") ?? "").trim().length > 0,
        });
      }}
      className="space-y-3"
    >
      <div className="flex flex-wrap gap-2">
        {friends.map((f) => (
          <label
            key={f.id}
            className={`flex cursor-pointer items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-sm has-checked:border-accent has-checked:bg-accent-soft ${
              f.alreadySent ? "opacity-50" : ""
            }`}
            title={f.alreadySent ? "Already recommended" : f.hasLogged ? "Already logged this" : undefined}
          >
            <input type="checkbox" name="friend" value={f.id} className="sr-only" disabled={f.alreadySent} />
            <Avatar name={f.display_name} url={f.avatar_url} size={24} />
            <span className="ph-mask">{f.display_name}</span>
            {f.alreadySent ? " ✓" : ""}
          </label>
        ))}
      </div>
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
