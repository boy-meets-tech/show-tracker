"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import posthog from "posthog-js";
import { Suspense, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Report pages by their pattern, not their exact address, so private bits
// (invite codes, usernames, search terms) never leave the device.
function scrub(url: string) {
  const u = new URL(url);
  u.pathname = u.pathname
    .replace(/^\/invite\/[^/]+/, "/invite/[code]")
    .replace(/^\/u\/[^/]+/, "/u/[username]")
    .replace(/^\/auth\/callback.*/, "/auth/callback");
  u.search = "";
  u.hash = "";
  return u.toString();
}

function beforeSend(event: BeforeSendEvent) {
  return { ...event, url: scrub(event.url) };
}

function PostHogIdentity() {
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !process.env.NEXT_PUBLIC_POSTHOG_HOST) return;

    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        posthog.reset();
        identifiedUserId.current = null;
        return;
      }

      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session?.user) {
        if (identifiedUserId.current && identifiedUserId.current !== session.user.id) {
          posthog.reset();
        }
        const properties: { email?: string; name?: string } = {};
        if (session.user.email) properties.email = session.user.email;
        if (typeof session.user.user_metadata.full_name === "string") {
          properties.name = session.user.user_metadata.full_name;
        }
        posthog.identify(session.user.id, properties);
        identifiedUserId.current = session.user.id;
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}

// Vercel Web Analytics (visits, pages, devices; no cookies) and Speed Insights
// (real load times from real phones).
export function Telemetry() {
  return (
    <Suspense>
      <PostHogIdentity />
      <Analytics beforeSend={beforeSend} />
      <SpeedInsights beforeSend={(e) => ({ ...e, url: scrub(e.url) })} />
    </Suspense>
  );
}
