"use client";

import { useActionState } from "react";
import posthog from "posthog-js";
import { updateProfile, type ActionState } from "@/app/actions";

export function ProfileForm({ username, displayName }: { username: string; displayName: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProfile, null);
  return (
    <form
      action={action}
      onSubmit={() => {
        if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
          posthog.capture("profile_update_submitted");
        }
      }}
      className="space-y-3"
    >
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Name</span>
        <input name="display_name" defaultValue={displayName} maxLength={50} className="input" required />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Username</span>
        <input
          name="username"
          defaultValue={username}
          pattern="[a-zA-Z0-9_]{3,20}"
          autoCapitalize="none"
          className="input"
          required
        />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.ok ? <span className="text-sm text-green-600">{state.ok}</span> : null}
        {state?.error ? <span className="text-sm text-red-500">{state.error}</span> : null}
      </div>
    </form>
  );
}
