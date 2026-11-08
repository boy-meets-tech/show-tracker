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
    | { username: string; display_name: string; avatar_url: string | null; used?: boolean }
    | undefined;

  if (!inviter || error || inviter.used) {
    return (
      <Card title={inviter?.used || error ? "This invite link has already been used" : "This invite link doesn't work"}>
        <p className="text-sm text-muted">
          {inviter?.used || error
            ? "Each invite link works for one person. If someone forwarded it to you, ask them for their own link, or find them on the "
            : "It may have expired. Ask your friend for a new one, or find them on the "}
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
        <p className="ph-mask text-sm text-muted">@{inviter.username}</p>
        <p className="mt-3 text-sm text-muted">
          You&apos;ll see what each other are watching and can swap recommendations.
        </p>
        <form action={acceptInvite.bind(null, code)} className="mt-6">
          <SubmitButton className="btn-primary px-6 py-2.5" pendingText="Joining…" event="invite_accepted">
            Accept and become friends
          </SubmitButton>
        </form>
        <div className="mt-6 rounded-lg bg-surface-2 p-3 text-left text-sm">
          <p className="font-medium">Not who you expected?</p>
          <p className="mt-1 text-muted">
            This link belongs to <span className="ph-mask">{inviter.display_name}</span>. If a different
            friend forwarded it to you, don&apos;t accept: find that friend on the{" "}
            <Link href="/friends" className="text-accent underline">
              Friends
            </Link>{" "}
            page instead.
          </p>
        </div>
        <Link href="/" className="mt-4 text-sm text-muted underline">
          Not now
        </Link>
      </div>
    </Card>
  );
}
