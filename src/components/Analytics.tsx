"use client";

import { useEffect } from "react";
import { identify, startAnalytics } from "@/lib/analytics";

// Starts PostHog once the page is idle.
export function StartAnalytics() {
  useEffect(() => startAnalytics(), []);
  return null;
}

// Links this device's sessions to the signed-in user, so a friend's session
// can be found if they report a problem.
export function IdentifyUser({ id, username }: { id: string; username: string }) {
  useEffect(() => identify(id, username), [id, username]);
  return null;
}
