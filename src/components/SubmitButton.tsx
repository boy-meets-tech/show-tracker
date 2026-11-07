"use client";

import { useFormStatus } from "react-dom";

// A form button that reacts the instant it's tapped: it dims, shows a small
// spinner and can't be tapped twice while the action runs.
export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title={title}
      className={`${className} ${pending ? "cursor-wait opacity-60" : ""}`}
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
