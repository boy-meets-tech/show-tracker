"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Suspense } from "react";
import { StartAnalytics } from "./Analytics";

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

// Vercel Web Analytics (visits, pages, devices; no cookies) and Speed Insights
// (real load times from real phones).
export function Telemetry() {
  return (
    <Suspense>
      <Analytics beforeSend={beforeSend} />
      <SpeedInsights beforeSend={(e) => ({ ...e, url: scrub(e.url) })} />
      <StartAnalytics />
    </Suspense>
  );
}
