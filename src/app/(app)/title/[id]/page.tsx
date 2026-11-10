import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeEntry } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { Poster } from "@/components/Poster";
import { RatingPicker } from "@/components/RatingPicker";
import { RecommendForm } from "@/components/RecommendForm";
import { StatusPicker } from "@/components/StatusPicker";
import { WhereToWatch } from "@/components/WhereToWatch";
import { Card, Skeleton } from "@/components/Section";
import { getMyId } from "@/lib/auth";
import { listFriends } from "@/lib/friends";
import { STATUS_LABEL, type WatchStatus } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { getTitleDetails } from "@/lib/tmdb";
import type { ProfileRow } from "@/lib/types";
import { SubmitButton } from "@/components/SubmitButton";

export default function TitlePage({ params }: PageProps<"/title/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={5} />}>
      <TitleContent params={params} />
    </Suspense>
  );
}

async function TitleContent({ params }: Pick<PageProps<"/title/[id]">, "params">) {
  const { id } = await params;
  const details = await getTitleDetails(id);
  if (!details) notFound();

  const facts = [
    details.mediaType === "tv" ? "TV series" : "Movie",
    details.year,
    details.seasons ? `${details.seasons} season${details.seasons === 1 ? "" : "s"}` : null,
    details.runtime,
    details.status && details.status !== "Released" ? details.status : null,
  ].filter(Boolean);

  return (
    <>
      <div className="mb-6 flex gap-4">
        <Poster path={details.posterPath} name={details.name} className="w-28 sm:w-40" size="w342" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{details.name}</h1>
          <p className="mt-1 text-sm text-muted">{facts.join(" · ")}</p>
          {details.genres.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {details.genres.map((g) => (
                <span key={g} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                  {g}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-3 hidden text-sm leading-relaxed sm:block">{details.overview}</p>
        </div>
      </div>
      <p className="mb-6 text-sm leading-relaxed sm:hidden">{details.overview}</p>

      <Suspense fallback={<Skeleton rows={3} />}>
        <Social titleId={details.id} titleName={details.name} />
      </Suspense>

      <p className="mt-8 text-xs text-muted">
        Data from{" "}
        <a
          href={`https://www.themoviedb.org/${details.mediaType}/${details.tmdbId}`}
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          TMDB
        </a>
        . This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </>
  );
}

type FriendEntry = {
  status: WatchStatus;
  rating: number | null;
  profiles: ProfileRow;
};

async function Social({ titleId, titleName }: { titleId: string; titleName: string }) {
  const me = { id: await getMyId() };
  const supabase = await createClient();

  const [{ data: entries }, { data: recs }, friends] = await Promise.all([
    supabase
      .from("watch_entries")
      .select("user_id, status, rating, profiles(id, username, display_name, avatar_url)")
      .eq("title_id", titleId),
    supabase
      .from("recommendations")
      .select("from_id, to_id, note, profiles!recommendations_from_id_fkey(id, username, display_name, avatar_url)")
      .eq("title_id", titleId),
    listFriends(me.id),
  ]);

  const all = (entries ?? []) as unknown as (FriendEntry & { user_id: string })[];
  const mine = all.find((e) => e.user_id === me.id);
  const theirs = all.filter((e) => e.user_id !== me.id);
  const recRows = (recs ?? []) as unknown as {
    from_id: string;
    to_id: string;
    note: string | null;
    profiles: ProfileRow;
  }[];
  const recommendedToMe = recRows.filter((r) => r.to_id === me.id);
  const alreadySentTo = new Set(recRows.filter((r) => r.from_id === me.id).map((r) => r.to_id));

  return (
    <>
      {recommendedToMe.length ? (
        <div className="mb-6 flex gap-3 rounded-xl bg-accent-soft p-3 text-sm">
          <div className="flex shrink-0 -space-x-2">
            {recommendedToMe.slice(0, 3).map((r) => (
              <span key={r.from_id} className="rounded-full ring-2 ring-[var(--accent-soft)]">
                <Avatar name={r.profiles.display_name} url={r.profiles.avatar_url} size={28} />
              </span>
            ))}
          </div>
          <div className="min-w-0">
            <strong className="ph-mask">{joinNames(recommendedToMe.map((r) => r.profiles.display_name))}</strong>{" "}
            recommended this to you
            {recommendedToMe.filter((r) => r.note).map((r) => (
              <p key={r.from_id} className="ph-mask mt-0.5">
                {recommendedToMe.length > 1 ? <span className="font-medium">{r.profiles.display_name}: </span> : null}
                <span className="italic">“{r.note}”</span>
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <Card title="Your status">
        <StatusPicker titleId={titleId} status={mine?.status ?? null} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <RatingPicker titleId={titleId} rating={mine?.rating ?? null} />
          {mine ? (
            <form action={removeEntry.bind(null, titleId)}>
              <SubmitButton className="inline-flex items-center gap-1.5 text-xs text-muted underline hover:text-foreground">Remove from library</SubmitButton>
            </form>
          ) : null}
        </div>
      </Card>

      <Suspense fallback={<Skeleton rows={1} />}>
        <WhereToWatch titleId={titleId} />
      </Suspense>

      <Card title="Friends">
        {theirs.length === 0 ? (
          <p className="text-sm text-muted">None of your friends have logged this yet.</p>
        ) : (
          <ul className="space-y-2">
            {theirs.map((e) => (
              <li key={e.profiles.id} className="flex items-center gap-3 text-sm">
                <Avatar name={e.profiles.display_name} url={e.profiles.avatar_url} size={28} />
                <Link href={`/u/${e.profiles.username}`} className="font-medium hover:underline">
                  <span className="ph-mask">{e.profiles.display_name}</span>
                </Link>
                <span className="text-muted">{STATUS_LABEL[e.status]}</span>
                {e.rating ? (
                  <span className="ml-auto font-semibold text-accent">{e.rating}/10</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recommend it">
        <RecommendForm
          titleId={titleId}
          titleName={titleName}
          friends={friends.map((f) => ({
            ...f,
            alreadySent: alreadySentTo.has(f.id),
            hasLogged: theirs.some((e) => e.profiles.id === f.id),
          }))}
        />
      </Card>
    </>
  );
}

function joinNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
