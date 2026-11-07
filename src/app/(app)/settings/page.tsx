import { Suspense } from "react";
import { signOut } from "@/app/actions";
import { CountryPicker } from "@/components/CountryPicker";
import { PasskeyButton } from "@/components/PasskeyButton";
import { ServicesPicker } from "@/components/ServicesPicker";
import { ProfileForm } from "@/components/ProfileForm";
import { PushSettings } from "@/components/PushSettings";
import { Card, PageTitle, Skeleton } from "@/components/Section";
import { getMe, getMyId } from "@/lib/auth";
import { countryName, detectedCountry } from "@/lib/country";
import { vapidPublicKey } from "@/lib/push";
import { streamingServices, watchCountries } from "@/lib/tmdb";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/SubmitButton";

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
  const myId = await getMyId();
  const supabase = await createClient();
  const [me, { data: prefs }, publicKey, detected, countries] = await Promise.all([
    getMe(),
    supabase
      .from("notification_settings")
      .select("friend_requests, recommendations, friend_activity, friend_loved")
      .eq("user_id", myId)
      .maybeSingle(),
    vapidPublicKey(),
    detectedCountry(),
    watchCountries(),
  ]);
  return (
    <>
      <Card title="Profile">
        <ProfileForm username={me.username} displayName={me.display_name} />
      </Card>
      <Card title="Where to watch">
        <CountryPicker
          current={me.country}
          detected={detected}
          detectedName={countryName(detected)}
          countries={countries}
        />
      </Card>
      <Suspense fallback={<Skeleton rows={2} />}>
        <MyServices country={me.country ?? detected} selected={me.services} />
      </Suspense>
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
        <SubmitButton className="btn-secondary" pendingText="Signing out…">Sign out</SubmitButton>
      </form>
    </>
  );
}

async function MyServices({ country, selected }: { country: string; selected: number[] }) {
  const services = await streamingServices(country);
  return (
    <section id="services">
      <Card title="My services">
        <ServicesPicker services={services} selected={selected} />
      </Card>
    </section>
  );
}
