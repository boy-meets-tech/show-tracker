import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  country: string | null; // chosen "Where to watch" country, or null for automatic
};

// The signed-in user's id. Checks the sign-in token locally (no call to the
// Supabase Auth server when the project uses asymmetric signing keys), so
// it's fast. Reads the session, so call it only from components inside a
// <Suspense> boundary, or from Server Actions.
export const getMyId = cache(async (): Promise<string> => {
  // Supabase checks token expiry with the current time, so this must run per
  // request rather than in a prerender.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/login");
  return id;
});

// The signed-in user's full profile (name, username, photo). One extra
// database read on top of getMyId, so use getMyId when only the id is needed.
export const getMe = cache(async (): Promise<Profile> => {
  const id = await getMyId();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, country")
    .eq("id", id)
    .single();
  if (!profile) redirect("/login");
  return profile as Profile;
});

// Only allow redirects to paths on this site.
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
