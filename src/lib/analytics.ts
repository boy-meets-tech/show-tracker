"use client";

// PostHog product analytics and session replay. Loaded lazily after the page
// is idle so it never slows the first paint. Safe to call before it loads:
// calls wait for it, and do nothing if PostHog isn't configured.
import type { PostHog } from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let loading: Promise<PostHog | null> | null = null;

// Report pages by pattern, not exact address, so invite codes, usernames,
// search terms and sign-in codes never leave the device.
export function scrubUrl(url: string) {
  try {
    const u = new URL(url, location.origin);
    u.pathname = u.pathname
      .replace(/^\/invite\/[^/]+/, "/invite/[code]")
      .replace(/^\/u\/[^/]+/, "/u/[username]")
      .replace(/^\/auth\/callback.*/, "/auth/callback");
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

const URL_PROPS = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$prev_pageview_pathname"];

function load(): Promise<PostHog | null> {
  if (!KEY || typeof window === "undefined") return Promise.resolve(null);
  loading ??= new Promise<void>((resolve) => {
    const start = () => resolve();
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 3000 });
    else setTimeout(start, 1500);
  })
    .then(() => import("posthog-js"))
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: "/ingest",
        ui_host: HOST.replace(".i.posthog.com", ".posthog.com"),
        defaults: "2026-05-30",
        person_profiles: "identified_only",
        capture_pageview: "history_change",
        // Autocapture records taps, but not the text or links on them (which
        // can include friends' names and usernames).
        mask_all_text: true,
        mask_all_element_attributes: true,
        session_recording: {
          maskAllInputs: true,
          // Friends' names, notes and photos are hidden in recordings; mark
          // more elements with .ph-mask (text) or .ph-no-capture (hide).
          maskTextSelector: ".ph-mask",
          blockSelector: ".ph-no-capture",
        },
        before_send: (event) => {
          if (!event) return event;
          for (const key of URL_PROPS) {
            const value = event.properties?.[key];
            if (typeof value === "string" && value.startsWith("http")) event.properties[key] = scrubUrl(value);
          }
          if (typeof event.properties?.$pathname === "string") {
            event.properties.$pathname = new URL(scrubUrl(location.origin + event.properties.$pathname)).pathname;
          }
          return event;
        },
      });
      return posthog;
    })
    .catch(() => null);
  return loading;
}

export function startAnalytics() {
  void load();
}

// Record a key action, e.g. track("show_logged", { status: "watching" }).
export function track(event: string, properties?: Record<string, string | number | boolean>) {
  void load().then((ph) => ph?.capture(event, properties));
}

export function identify(userId: string, username: string) {
  void load().then((ph) => {
    if (ph && ph.get_distinct_id() !== userId) ph.identify(userId, { username });
  });
}

export function resetAnalytics() {
  void load().then((ph) => ph?.reset());
}
