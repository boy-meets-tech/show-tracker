import { STATUSES, STATUS_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import type { EntryRow } from "@/lib/types";
import { TitleRow } from "./TitleRow";

// A person's logged titles, grouped by status. RLS only returns rows for
// yourself and your friends.
export async function Library({ userId, empty }: { userId: string; empty: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("watch_entries")
    .select("title_id, status, rating, updated_at, titles(id, name, media_type, poster_path, year)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  const entries = (data ?? []) as unknown as EntryRow[];
  if (entries.length === 0) return <>{empty}</>;

  return (
    <div className="space-y-8">
      {STATUSES.map((status) => {
        const group = entries.filter((e) => e.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="mb-2 font-semibold">
              {STATUS_LABEL[status]} <span className="font-normal text-muted">{group.length}</span>
            </h2>
            <div className="grid gap-1 sm:grid-cols-2">
              {group.map((e) => (
                <TitleRow
                  key={e.title_id}
                  id={e.titles.id}
                  name={e.titles.name}
                  posterPath={e.titles.poster_path}
                  year={e.titles.year}
                  mediaType={e.titles.media_type}
                >
                  {e.rating ? (
                    <span className="mt-1 inline-block text-xs font-semibold text-accent">
                      {e.rating}/10
                    </span>
                  ) : null}
                </TitleRow>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
