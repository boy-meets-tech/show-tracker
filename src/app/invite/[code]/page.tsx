import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvite } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { Poster } from "@/components/Poster";
import { Card, Skeleton } from "@/components/Section";
import { SubmitButton } from "@/components/SubmitButton";
import { getMyIdOrNull } from "@/lib/auth";
import { posterUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";

// Outside the signed-in app: people who haven't joined yet open these links.

type Preview = {
  username: string;
  display_name: string;
  avatar_url: string | null;
  used?: boolean;
  title_id?: string | null;
  title_name?: string | null;
  title_poster?: string | null;
  title_media?: string | null;
  title_year?: number | null;
  note?: string | null;
};

async function preview(code: string): Promise<Preview | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { invite_code: code });
  return ((data ?? [])[0] as Preview | undefined) ?? null;
}

// Link previews in Messages, WhatsApp etc.: "Naveed recommends Severance".
export async function generateMetadata({ params }: PageProps<"/invite/[code]">): Promise<Metadata> {
  const { code } = await params;
  const p = await preview(code).catch(() => null);
  if (!p) return { title: "You're invited" };
  const title = p.title_name
    ? `${p.display_name} recommends ${p.title_name}`
    : `${p.display_name} invited you to Show Tracker`;
  const description = p.note
    ? `“${p.note}” Join Show Tracker to see what your friends are watching.`
    : "Join Show Tracker to see what your friends are watching and swap recommendations.";
  const image = posterUrl(p.title_poster ?? null, "w500");
  return {
    title,
    description,
    openGraph: { title, description, images: image ? [{ url: image }] : undefined },
  };
}

export default function InvitePage({ params, searchParams }: PageProps<"/invite/[code]">) {
  return (
    <main className="mx-auto max-w-md px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-12">
      <Link href="/" className="mb-6 block text-lg font-bold tracking-tight">
        Show<span className="text-accent">Tracker</span>
      </Link>
      <Suspense fallback={<Skeleton rows={3} />}>
        <Invite params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Invite({ params, searchParams }: PageProps<"/invite/[code]">) {
  const [{ code }, { error }] = await Promise.all([params, searchParams]);
  const [meId, inviter] = await Promise.all([getMyIdOrNull(), preview(code)]);
  const signInHref = `/login?next=${encodeURIComponent(`/invite/${code}`)}`;

  if (!inviter) {
    // Before the database update, previews only work when signed in.
    if (!meId) {
      return (
        <Card title="You've been invited to Show Tracker">
          <p className="mb-4 text-sm text-muted">
            Sign in or create an account to see who invited you.
          </p>
          <Link href={signInHref} className="btn-primary">
            Continue
          </Link>
        </Card>
      );
    }
    return <Unusable />;
  }
  if (inviter.used || error) return <Unusable used />;

  const isMine = meId !== null && (await isOwnInvite(inviter.username));
  if (isMine) {
    return (
      <Card title="This is your own invite link">
        <p className="text-sm text-muted">Send it to a friend so they can join you.</p>
      </Card>
    );
  }

  const hasTitle = Boolean(inviter.title_id && inviter.title_name);
  return (
    <Card>
      <div className="flex flex-col items-center py-2 text-center">
        <Avatar name={inviter.display_name} url={inviter.avatar_url} size={56} />
        <h1 className="mt-3 text-xl font-bold">
          <span className="ph-mask">{inviter.display_name}</span>{" "}
          {hasTitle ? "thinks you'd love" : "invited you to be friends"}
        </h1>
        <p className="ph-mask text-sm text-muted">@{inviter.username}</p>

        {hasTitle ? (
          <div className="mt-5 flex w-full items-center gap-4 rounded-xl bg-surface-2 p-3 text-left">
            <Poster path={inviter.title_poster ?? null} name={inviter.title_name!} className="w-20" size="w342" />
            <div className="min-w-0">
              <p className="text-lg font-semibold">{inviter.title_name}</p>
              <p className="text-xs text-muted">
                {inviter.title_media === "tv" ? "TV" : "Movie"}
                {inviter.title_year ? ` · ${inviter.title_year}` : ""}
              </p>
              {inviter.note ? <p className="ph-mask mt-2 text-sm italic">“{inviter.note}”</p> : null}
            </div>
          </div>
        ) : null}

        <p className="mt-5 text-sm text-muted">
          Show Tracker is where friends keep track of what they&apos;re watching and swap
          recommendations.
          {hasTitle ? " Join to save this to your list and see what else they're into." : ""}
        </p>

        {meId ? (
          <form action={acceptInvite.bind(null, code, inviter.title_id ?? undefined)} className="mt-6">
            <SubmitButton className="btn-primary px-6 py-2.5" pendingText="Joining…" event="invite_accepted">
              {hasTitle ? "Accept and see it" : "Accept and become friends"}
            </SubmitButton>
          </form>
        ) : (
          <Link href={signInHref} className="btn-primary mt-6 px-6 py-2.5">
            Join Show Tracker
          </Link>
        )}

        {meId ? (
          <div className="mt-6 rounded-lg bg-surface-2 p-3 text-left text-sm">
            <p className="font-medium">Not who you expected?</p>
            <p className="mt-1 text-muted">
              This link belongs to <span className="ph-mask">{inviter.display_name}</span>. If a
              different friend forwarded it to you, don&apos;t accept: find that friend on the{" "}
              <Link href="/friends" className="text-accent underline">
                Friends
              </Link>{" "}
              page instead.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">Free. Sign in with Google or your email.</p>
        )}
        {meId ? (
          <Link href="/" className="mt-4 text-sm text-muted underline">
            Not now
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

async function isOwnInvite(inviterUsername: string) {
  const supabase = await createClient();
  const meId = await getMyIdOrNull();
  const { data } = await supabase.from("profiles").select("username").eq("id", meId!).maybeSingle();
  return data?.username === inviterUsername;
}

function Unusable({ used = false }: { used?: boolean }) {
  return (
    <Card title={used ? "This invite link has already been used" : "This invite link doesn't work"}>
      <p className="text-sm text-muted">
        {used
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
