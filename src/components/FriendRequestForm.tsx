"use client";

import { useActionState } from "react";
import { sendFriendRequest, type ActionState } from "@/app/actions";

export function FriendRequestForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendFriendRequest, null);
  return (
    <form action={action}>
      <div className="flex gap-2">
        <input
          name="username"
          placeholder="@username"
          className="input"
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
        <button className="btn-secondary shrink-0" disabled={pending}>
          {pending ? "Sending…" : "Add friend"}
        </button>
      </div>
      {state?.ok ? <p className="mt-2 text-sm text-green-600">{state.ok}</p> : null}
      {state?.error ? <p className="mt-2 text-sm text-red-500">{state.error}</p> : null}
    </form>
  );
}
