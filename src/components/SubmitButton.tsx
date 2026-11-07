"use client";

import posthog from "posthog-js";
import { useFormStatus } from "react-dom";

// A form button that reacts the instant it's tapped: it dims, shows a small
// spinner and can't be tapped twice while the action runs.
export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText,
  title,
  resetPostHog = false,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  title?: string;
  resetPostHog?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title={title}
      className={`${className} ${pending ? "cursor-wait opacity-60" : ""}`}
      onClick={() => {
        if (
          resetPostHog &&
          process.env.NEXT_PUBLIC_POSTHOG_KEY &&
          process.env.NEXT_PUBLIC_POSTHOG_HOST
        ) {
          posthog.reset();
        }
      }}
    >
      {pending ? (
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
