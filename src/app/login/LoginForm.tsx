"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/";
}

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "google" | "passkey" | "email">(null);
  const [message, setMessage] = useState<string | null>(
    params.get("error") ? "That sign-in link didn't work. Try again." : null
  );
  const [sent, setSent] = useState(false);

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setBusy("google");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setMessage(error.message);
      setBusy(null);
    } else if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      posthog.capture("login_requested", { method: "google" });
    }
  }

  async function passkey() {
    setBusy("passkey");
    setMessage(null);
    const { error } = await createClient().auth.signInWithPasskey();
    if (error) {
      setMessage(
        "No passkey found for this device. Sign in another way first, then add a passkey in Settings."
      );
      setBusy(null);
      return;
    }
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      posthog.capture("login_requested", { method: "passkey" });
    }
    router.replace(next);
    router.refresh();
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setMessage(null);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setBusy(null);
    if (error) setMessage(error.message);
    else {
      if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
        posthog.capture("login_requested", { method: "magic_link" });
      }
      setSent(true);
    }
  }

  return (
    <div className="mt-8 space-y-3">
      <button className="btn-secondary w-full py-2.5" onClick={google} disabled={busy !== null}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
        </svg>
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      <button className="btn-secondary w-full py-2.5" onClick={passkey} disabled={busy !== null}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="8" cy="8" r="4" />
          <path d="M2 21c0-3.5 2.7-6 6-6 1.5 0 2.8.5 3.8 1.3M16 12a3 3 0 1 1 3 3v6l-1.5 1-1.5-1v-1.5l1-1-1-1V15a3 3 0 0 1 0-3z" />
        </svg>
        {busy === "passkey" ? "Waiting for passkey…" : "Sign in with a passkey"}
      </button>

      <div className="flex items-center gap-3 py-2 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or get a link by email <span className="h-px flex-1 bg-border" />
      </div>

      {sent ? (
        <p className="rounded-lg bg-accent-soft p-3 text-sm">
          Check <strong>{email}</strong> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={magicLink} className="flex gap-2">
          <input
            type="email"
            required
            autoComplete="email webauthn"
            placeholder="you@example.com"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn-primary shrink-0" disabled={busy !== null}>
            {busy === "email" ? "Sending…" : "Send link"}
          </button>
        </form>
      )}

      {message ? <p className="text-sm text-red-500">{message}</p> : null}
    </div>
  );
}
