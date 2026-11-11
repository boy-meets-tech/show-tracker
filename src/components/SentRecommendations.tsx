import { Avatar } from "@/components/Avatar";
import { Card, Empty } from "@/components/Section";
import { TitleRow } from "@/components/TitleRow";
import { timeAgo } from "@/lib/labels";
import { hitRate, outcomeLabel, outcomeOf, type FriendEntry, type SentRec } from "@/lib/recStats";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, TitleRowData } from "@/lib/types";

type Row = SentRec & { to: ProfileRow; titles: TitleRowData };
type PendingInvite = { code: string; created_at: string; titles: TitleRowData | null };

const PILL: Record<string, string> = {
  finished: "bg-accent text-accent-contrast",
  watching: "bg-accent-soft text-accent",
  dropped: "bg-surface-2 text-muted",
  saved: "bg-surface-2 text-foreground",
  passed: "bg-surface-2 text-muted",
  waiting: "bg-surface-2 text-muted",
};

// Everything you've recommended, what each friend did with it, and your hit rate.
export async function SentRecommendations({ meId }: { meId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recommendations")
    .select(
      "id, to_id, title_id, created_at, dismissed_at, to:profiles!recommendations_to_id_fkey(id, username, display_name, avatar_url), titles(id, name, media_type, poster_path, year)"
    )
    .eq("from_id", meId)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as unknown as Row[];

  // The friends' library entries for those titles (visible because you're friends).
  const { data: entryData } = rows.length
    ? await supabase
        .from("watch_entries")
        .select("user_id, title_id, status, rating")
        .in("user_id", [...new Set(rows.map((r) => r.to_id))])
        .in("title_id", [...new Set(rows.map((r) => r.title_id))])
    : { data: [] };
  const entries = new Map(
    ((entryData ?? []) as FriendEntry[]).map((e) => [`${e.user_id}:${e.title_id}`, e])
  );
  // Titles sent by link to people who haven't joined yet.
  const { data: inviteData } = await supabase
    .from("invites")
    .select("code, created_at, titles(id, name, media_type, poster_path, year)")
    .eq("created_by", meId)
    .not("title_id", "is", null)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  // Errors (before the database update) just mean there are none to show.
  const linkPending = ((inviteData ?? []) as unknown as PendingInvite[])
    .filter((p) => p.titles)
    .map((p) => ({ key: p.code, created_at: p.created_at, titles: p.titles, label: "Sent by link · waiting for them to join" }));

  // Recommendations waiting on a friend request.
  const { data: requestData } = await supabase
    .from("pending_recommendations")
    .select("to_id, title_id, created_at, to:profiles!pending_recommendations_to_id_fkey(display_name), titles(id, name, media_type, poster_path, year)")
    .eq("from_id", meId)
    .order("created_at", { ascending: false })
    .limit(20);
  const requestPending = ((requestData ?? []) as unknown as {
    to_id: string;
    title_id: string;
    created_at: string;
    to: { display_name: string } | null;
    titles: TitleRowData | null;
  }[])
    .filter((p) => p.titles)
    .map((p) => ({
      key: `${p.to_id}:${p.title_id}`,
      created_at: p.created_at,
      titles: p.titles,
      label: `To ${p.to?.display_name ?? "someone"} · waiting for them to accept your friend request`,
    }));
  const pending = [...requestPending, ...linkPending].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const outcomes = rows.map((r) => outcomeOf(r, entries.get(`${r.to_id}:${r.title_id}`)));
  const stats = hitRate(outcomes);

  return (
    <Card title="You recommended">
      {pending.length ? (
        <ul className="mb-4 divide-y divide-border">
          {pending.map((p) => (
            <li key={p.key} className="py-1">
              <TitleRow
                id={p.titles!.id}
                name={p.titles!.name}
                posterPath={p.titles!.poster_path}
                year={p.titles!.year}
                mediaType={p.titles!.media_type}
              >
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="ph-mask rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                    {p.label}
                  </span>
                  <span className="text-muted">· {timeAgo(p.created_at)}</span>
                </div>
              </TitleRow>
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length === 0 ? (
        pending.length ? null : <Empty>
          Nothing yet. Open any show or movie and use &ldquo;Recommend to a friend&rdquo;.
        </Empty>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <Stat value={`${stats.started}/${stats.sent}`} label="started" />
            <Stat value={String(stats.hits)} label="hits (finished or 8+)" />
            <Stat
              value={stats.averageRating !== null ? `${stats.averageRating}` : "–"}
              label={stats.rated ? `avg rating (${stats.rated})` : "avg rating"}
            />
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r, i) => {
              const o = outcomes[i];
              return (
                <li key={r.id} className="py-1">
                  <TitleRow
                    id={r.titles.id}
                    name={r.titles.name}
                    posterPath={r.titles.poster_path}
                    year={r.titles.year}
                    mediaType={r.titles.media_type}
                  >
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <Avatar name={r.to.display_name} url={r.to.avatar_url} size={16} />
                      <span className="ph-mask">{r.to.display_name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL[o.kind]}`}>
                        {outcomeLabel(o)}
                      </span>
                      <span className="text-muted">· sent {timeAgo(r.created_at)}</span>
                    </div>
                  </TitleRow>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
