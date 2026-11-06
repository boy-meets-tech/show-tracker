"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasskeyButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function add() {
    setState("busy");
    const { error } = await createClient().auth.registerPasskey();
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("done");
    }
  }

  return (
    <div>
      <button onClick={add} className="btn-primary" disabled={state === "busy"}>
        {state === "busy" ? "Follow your device's prompt…" : "Add a passkey"}
      </button>
      {state === "done" ? <p className="mt-2 text-sm text-green-600">Passkey added.</p> : null}
      {state === "error" ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
