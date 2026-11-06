import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { PasskeyButton } from "@/components/PasskeyButton";
import { ProfileForm } from "@/components/ProfileForm";
import { Card, PageTitle, Skeleton } from "@/components/Section";
import { getMe } from "@/lib/auth";

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
  return (
    <>
      <Card title="Profile">
        <ProfileForm username={me.username} displayName={me.display_name} />
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
