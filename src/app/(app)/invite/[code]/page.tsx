import { Suspense } from "react";
import Link from "next/link";
import { acceptInvite } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { Card, Skeleton } from "@/components/Section";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "You're invited" };

export default function InvitePage({ params, searchParams }: PageProps<"/invite/[code]">) {
  return (
    <div className="mx-auto mt-6 max-w-md">
      <Suspense fallback={<Skeleton rows={2} />}>
        <Invite params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Invite({ params, searchParams }: PageProps<"/invite/[code]">) {
  const [{ code }, { error }] = await Promise.all([params, searchParams]);
  const me = await getMe();
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { invite_code: code });
  const inviter = (data ?? [])[0] as
    | { username: string; display_name: string; avatar_url: string | null }
    | undefined;

  if (!inviter || error) {
    return (
      <Card title="This invite link doesn't work">
        <p className="text-sm text-muted">
          It may have expired. Ask your friend for a new one, or add them by username on the{" "}
          <Link href="/friends" className="text-accent underline">
            Friends
          </Link>{" "}
          page.
        </p>
      </Card>
    );
  }

  if (inviter.username === me.username) {
    return (
      <Card title="This is your own invite link">
        <p className="text-sm text-muted">Send it to a friend so they can add you.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col items-center py-4 text-center">
        <Avatar name={inviter.display_name} url={inviter.avatar_url} size={72} />
        <h1 className="mt-4 text-xl font-bold">
          <span className="ph-mask">{inviter.display_name}</span> invited you to be friends
        </h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll see what each other are watching and can swap recommendations.
        </p>
        <form action={acceptInvite.bind(null, code)} className="mt-6">
          <SubmitButton className="btn-primary px-6 py-2.5" pendingText="Joining…" event="invite_accepted">Accept invite</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
