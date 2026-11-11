import { Suspense } from "react";
import Link from "next/link";
import { dismissRecommendation } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { Card, Empty, PageTitle, Skeleton } from "@/components/Section";
import { SentRecommendations } from "@/components/SentRecommendations";
import { ServiceBadge } from "@/components/ServiceBadge";
import { TitleRow } from "@/components/TitleRow";
import { onMyServices } from "@/lib/watch";
import { getMyId } from "@/lib/auth";
import { timeAgo } from "@/lib/labels";
import { isTrustedTaste, tasteLabel, type TasteStats } from "@/lib/recStats";
import { tasteStats } from "@/lib/taste";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, TitleRowData } from "@/lib/types";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "For you" };

export default function RecsPage() {
  return (
    <>
      <PageTitle sub="Everything your friends told you to watch, and how your own picks landed.">
        For you
      </PageTitle>
      <Suspense fallback={<Skeleton rows={6} />}>
        <Recs />
      </Suspense>
    </>
  );
}

type Rec = {
  id: number;
  outside?: boolean; // someone not on Show Tracker, saved by name
  note: string | null;
  created_at: string;
  profiles: ProfileRow;
  titles: TitleRowData;
};

type Pick = {
  title_id: string;
  name: string;
  media_type: string;
  poster_path: string | null;
  year: number | null;
  avg_rating: number;
  friend_count: number;
  friend_names: string[];
};

async function Recs() {
  const me = { id: await getMyId() };
  const supabase = await createClient();
  const [{ data: recData }, { data: pickData }, { data: toldData }] = await Promise.all([
    supabase
      .from("recommendations")
      .select(
        "id, note, created_at, profiles!recommendations_from_id_fkey(id, username, display_name, avatar_url), titles(id, name, media_type, poster_path, year)"
      )
      .eq("to_id", me.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("friend_picks", { max_results: 20 }),
    // People not on Show Tracker who told you about something.
    supabase
      .from("told_me")
      .select("id, name, note, created_at, titles(id, name, media_type, poster_path, year)")
      .eq("user_id", me.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false }),
  ]);
  const told = ((toldData ?? []) as unknown as (Omit<Rec, "profiles"> & { name: string })[]).map(
    (t): Rec => ({
      ...t,
      id: -t.id,
      outside: true,
      profiles: { id: `told-${t.id}`, username: "", display_name: t.name, avatar_url: null },
    })
  );
  const recs = [...((recData ?? []) as unknown as Rec[]), ...told].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  const taste = await tasteStats(recs.filter((r) => !r.outside).map((r) => r.profiles.id));
  const picks = (pickData ?? []) as Pick[];
  const available = await onMyServices([...recs.map((r) => r.titles.id), ...picks.map((p) => p.title_id)]);
  // Several friends recommending the same title show as one entry (newest first).
  const groups: Rec[][] = [];
  for (const r of recs) {
    const group = groups.find((g) => g[0].titles.id === r.titles.id);
    if (group) group.push(r);
    else groups.push([r]);
  }
  // Titles more friends recommend come first; ties stay newest first.
  groups.sort((a, b) => b.length - a.length);

  return (
    <>
      <Card title="Recommended to you">
        {recs.length === 0 ? (
          <Empty>
            No recommendations right now. When someone tells you about a show, open it and add
            them under &ldquo;Who told you about it?&rdquo;
          </Empty>
        ) : (
          <ul className="space-y-1">
            {groups.map((group) => {
              const t = group[0].titles;
              const several = group.length > 1;
              return (
              <li
                key={t.id}
                className={`flex items-start gap-2 rounded-lg border-l-4 py-2 pr-2 pl-1 ${
                  several ? "border-accent bg-accent-soft/60" : "border-transparent"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <TitleRow
                    id={t.id}
                    name={t.name}
                    posterPath={t.poster_path}
                    year={t.year}
                    mediaType={t.media_type}
                  >
                    {several ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-contrast">
                        🔥 {group.length} friends recommend this
                      </span>
                    ) : null}
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <span className="flex -space-x-1.5">
                        {group.slice(0, 3).map((r) => (
                          <span key={r.id} className="rounded-full ring-2 ring-[var(--surface)]">
                            <Avatar name={r.profiles.display_name} url={r.profiles.avatar_url} size={16} />
                          </span>
                        ))}
                      </span>
                      <span>
                        From <strong className="ph-mask">{formatNames(group.map((r) => r.profiles.display_name))}</strong> ·{" "}
                        {timeAgo(group[0].created_at)}
                      </span>
                    </div>
                    <TasteLine group={group} taste={taste} />
                    {group.filter((r) => r.note).map((r) => (
                      <p key={r.id} className="ph-mask mt-1 text-sm">
                        {several ? <span className="font-medium">{r.profiles.display_name}: </span> : null}
                        <span className="italic">“{r.note}”</span>
                      </p>
                    ))}
                    <ServiceBadge names={available[t.id]} />
                  </TitleRow>
                </div>
                <form action={dismissRecommendation.bind(null, t.id)}>
                  <SubmitButton event="recommendation_dismissed" className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted underline hover:text-foreground">Dismiss</SubmitButton>
                </form>
              </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Your friends loved these">
        {picks.length === 0 ? (
          <Empty>
            When friends rate something 8/10 or higher that you haven&apos;t logged, it shows up
            here. <Link href="/friends" className="text-accent underline">Add more friends</Link> to
            get more picks.
          </Empty>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {picks.map((p) => (
              <TitleRow
                key={p.title_id}
                id={p.title_id}
                name={p.name}
                posterPath={p.poster_path}
                year={p.year}
                mediaType={p.media_type}
              >
                <p className="mt-1 text-xs">
                  <span className="font-semibold text-accent">{p.avg_rating}/10</span>{" "}
                  <span className="text-muted">
                    from <span className="ph-mask">{formatNames(p.friend_names)}</span>
                  </span>
                </p>
                <ServiceBadge names={available[p.title_id]} />
              </TitleRow>
            ))}
          </div>
        )}
      </Card>

      <Suspense fallback={<Skeleton rows={3} />}>
        <SentRecommendations meId={me.id} />
      </Suspense>
    </>
  );
}

function formatNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

// "🎯 Ariel 4/5 recs hit": how often each recommender's picks land.
function TasteLine({ group, taste }: { group: Rec[]; taste: Map<string, TasteStats> }) {
  const parts = group
    .filter((r) => !r.outside)
    .map((r) => ({ name: r.profiles.display_name, stats: taste.get(r.profiles.id) }))
    .filter((p) => tasteLabel(p.stats));
  if (parts.length === 0) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
      {parts.map((p) => (
        <span key={p.name} className={isTrustedTaste(p.stats) ? "font-medium text-accent" : undefined}>
          🎯 <span className="ph-mask">{group.length > 1 ? `${p.name} ` : ""}</span>
          {tasteLabel(p.stats)}
          {isTrustedTaste(p.stats) ? " · trusted taste" : ""}
        </span>
      ))}
    </p>
  );
}
