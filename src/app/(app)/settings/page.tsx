import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { PasskeyButton } from "@/components/PasskeyButton";
import { ProfileForm } from "@/components/ProfileForm";
import { PushSettings } from "@/components/PushSettings";
import { Card, PageTitle, Skeleton } from "@/components/Section";
import { getMe } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageTitle>Settings</PageTitle>
      <Suspense fallback={<Skeleton rows={3} />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const me = await getMe();
  const supabase = await createClient();
  const [{ data: prefs }, publicKey] = await Promise.all([
    supabase
      .from("notification_settings")
      .select("friend_requests, recommendations, friend_activity, friend_loved")
      .eq("user_id", me.id)
      .maybeSingle(),
    vapidPublicKey(),
  ]);
  return (
    <>
      <Card title="Profile">
        <ProfileForm username={me.username} displayName={me.display_name} />
      </Card>
      <Card title="Notifications">
        <PushSettings
          publicKey={publicKey}
          settings={
            prefs ?? {
              friend_requests: true,
              recommendations: true,
              friend_activity: true,
              friend_loved: true,
            }
          }
        />
      </Card>
      <Card title="Passkeys">
        <p className="mb-3 text-sm text-muted">
          Sign in with Face ID, Touch ID, or your device PIN next time instead of waiting for an
          email.
        </p>
        <PasskeyButton />
      </Card>
      <form action={signOut}>
        <button className="btn-secondary">Sign out</button>
      </form>
    </>
  );
}
