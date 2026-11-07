import { Suspense } from "react";
import { IdentifyUser } from "@/components/Analytics";
import { InstallPrompt } from "@/components/InstallPrompt";
import { getMe } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-12">
        <InstallPrompt />
        <Suspense>
          <Identify />
        </Suspense>
        {children}
      </main>
    </>
  );
}

async function Identify() {
  const me = await getMe();
  return <IdentifyUser id={me.id} username={me.username} />;
}
