"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Chrome/Android's install event (not yet in TypeScript's DOM types).
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "install-prompt-dismissed";
const noop = () => () => {};

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  // iPadOS reports itself as a Mac, so also check for a touch screen.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// Read once on the client: "hidden" | "ios" | "other". Server renders nothing.
function initialMode(): "hidden" | "ios" | "other" {
  if (isInstalled() || wasDismissed()) return "hidden";
  return isIos() ? "ios" : "other";
}

export function InstallPrompt() {
  const mode = useSyncExternalStore(noop, initialMode, () => "hidden" as const);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault(); // Show our own button instead of Chrome's mini-bar.
      setInstallEvent(e as InstallEvent);
    }
    function onInstalled() {
      setClosed(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setClosed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode: it'll just show again next visit.
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setClosed(true);
    setInstallEvent(null);
  }

  // Android/desktop Chrome only shows the banner once it says the app is installable.
  if (closed || mode === "hidden" || (mode === "other" && !installEvent)) return null;

  return (
    <div className="mb-6 flex gap-3 rounded-xl border border-border bg-surface p-4">
      <img src="/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Add Show Tracker to your Home Screen</p>
        {mode === "ios" ? (
          <p className="mt-1 text-muted">
            In Safari, tap{" "}
            <ShareIcon />{" "}
            <strong className="text-foreground">Share</strong> (it&apos;s under{" "}
            <strong className="text-foreground">⋯</strong> if you don&apos;t see it), then{" "}
            <strong className="text-foreground">Add to Home Screen</strong>.
          </p>
        ) : (
          <>
            <p className="mt-1 text-muted">Open it like an app, one tap from your home screen.</p>
            <button onClick={install} className="btn-primary mt-3 py-1.5">
              Install
            </button>
          </>
        )}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="-mt-1 -mr-1 h-8 w-8 shrink-0 rounded-md text-lg leading-none text-muted hover:bg-surface-2"
      >
        ×
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="inline h-4 w-4 -translate-y-px align-text-bottom text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
