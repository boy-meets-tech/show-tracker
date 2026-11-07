"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import {
  deletePushSubscription,
  savePushSubscription,
  sendTestPush,
  setNotificationSetting,
} from "@/app/actions";
import type { NotificationKind, PushResult } from "@/lib/push";
import { track } from "@/lib/analytics";

type Settings = Record<NotificationKind, boolean>;

const OPTIONS: { kind: NotificationKind; label: string; hint: string }[] = [
  { kind: "friend_requests", label: "Friend requests", hint: "Someone asks to be friends or accepts your request" },
  { kind: "recommendations", label: "Recommendations", hint: "A friend recommends something to you" },
  { kind: "friend_loved", label: "Friends loved it", hint: "A friend rates 8+ something on your Want to watch list" },
  { kind: "friend_activity", label: "Friend activity", hint: "A friend starts, finishes, drops or rates something" },
];

const noop = () => () => {};

const TEST_DELAY = 5;

function describe(result: PushResult) {
  if (result.sent > 0) {
    return "Delivered to Apple/Google. If nothing appeared, check that notifications are allowed for Show Tracker in your phone's Settings → Notifications.";
  }
  return `It didn't go through: ${result.problem ?? "unknown problem"}.`;
}

// What this device can do, read once on the client.
function deviceSupport(): "unsupported" | "ios-browser" | "ok" {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iPhones only allow push for web apps opened from the Home Screen.
  if (ios && !installed) return "ios-browser";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  return "ok";
}

function base64UrlToBytes(value: string) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// A random id for this device, kept in its storage, so re-registering
// replaces this device's old registration instead of adding another.
function deviceId(): string | undefined {
  try {
    let id = localStorage.getItem("push-device-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("push-device-id", id);
    }
    return id;
  } catch {
    return undefined;
  }
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/sw.js", { scope: "/" }))
  );
}

export function PushSettings({
  publicKey,
  settings,
}: {
  publicKey: string | null;
  settings: Settings;
}) {
  const support = useSyncExternalStore(noop, deviceSupport, () => "ok" as const);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Plain async (not a transition) so progress messages show immediately.
  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  // Is this device already set up?
  useEffect(() => {
    if (support !== "ok") return;
    let cancelled = false;
    (async () => {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (cancelled) return;
      setBlocked(Notification.permission === "denied");
      setSubscribed(Boolean(sub));
      // Keep the server's copy fresh in case it was cleared.
      if (sub) await savePushSubscription(sub.toJSON() as Parameters<typeof savePushSubscription>[0], deviceId());
    })().catch(() => !cancelled && setSubscribed(false));
    return () => {
      cancelled = true;
    };
  }, [support]);

  function turnOn() {
    setMessage(null);
    void run(async () => {
      try {
        if (!publicKey) throw new Error("Notifications aren't set up on the server yet.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setBlocked(permission === "denied");
          setMessage("Notifications weren't allowed.");
          return;
        }
        const reg = await registration();
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(publicKey),
          }));
        await savePushSubscription(sub.toJSON() as Parameters<typeof savePushSubscription>[0], deviceId());
        setSubscribed(true);
        track("notifications_enabled");
        setMessage(
          `Done! Leave the app or lock your phone now: a test notification arrives in ${TEST_DELAY} seconds.`
        );
        setMessage(describe(await sendTestPush(TEST_DELAY)));
      } catch (e) {
        setMessage((e as Error).message || "Something went wrong. Try again.");
      }
    });
  }

  function turnOff() {
    setMessage(null);
    void run(async () => {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    });
  }

  function test() {
    setMessage(null);
    void run(async () => {
      setMessage(`Leave the app or lock your phone now: the test arrives in ${TEST_DELAY} seconds.`);
      setMessage(describe(await sendTestPush(TEST_DELAY)));
    });
  }

  return (
    <div className="space-y-4">
      {support === "ios-browser" ? (
        <p className="rounded-lg bg-accent-soft p-3 text-sm">
          On iPhone, notifications only work in the Home Screen app. In Safari, tap{" "}
          <strong>Share</strong> → <strong>Add to Home Screen</strong>, open Show Tracker from
          the new icon, then come back here.
        </p>
      ) : support === "unsupported" ? (
        <p className="text-sm text-muted">This browser doesn&apos;t support notifications.</p>
      ) : blocked ? (
        <p className="text-sm text-muted">
          Notifications are blocked for Show Tracker. Allow them in your phone or browser
          settings, then reload this page.
        </p>
      ) : subscribed === null ? (
        <p className="text-sm text-muted">Checking this device…</p>
      ) : subscribed ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            <span className="text-green-600">●</span> On for this device
          </span>
          <button onClick={test} disabled={busy} className="btn-secondary ml-auto py-1.5">
            {busy ? "Sending…" : "Send a test"}
          </button>
          <button onClick={turnOff} disabled={busy} className="btn-secondary py-1.5">
            Turn off
          </button>
        </div>
      ) : (
        <button onClick={turnOn} disabled={busy} className="btn-primary">
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
      {message ? <p className="text-sm text-muted">{message}</p> : null}

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="mb-2 text-sm text-muted">Notify me about</legend>
        {OPTIONS.map((o) => (
          <Toggle key={o.kind} kind={o.kind} label={o.label} hint={o.hint} initial={settings[o.kind]} />
        ))}
      </fieldset>
    </div>
  );
}

function Toggle({
  kind,
  label,
  hint,
  initial,
}: {
  kind: NotificationKind;
  label: string;
  hint: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(() => setNotificationSetting(kind, next));
        }}
        className="mt-1 h-4 w-4 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
