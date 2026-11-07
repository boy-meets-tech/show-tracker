import { Suspense } from "react";
import Form from "next/form";
import { PageTitle, Empty, Skeleton } from "@/components/Section";
import { TitleRow } from "@/components/TitleRow";
import { STATUS_LABEL, type WatchStatus } from "@/lib/labels";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { searchTitles, trendingTitles, type TitleSummary } from "@/lib/tmdb";

export const metadata = { title: "Search" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <PageTitle>Search</PageTitle>
      <Suspense fallback={<SearchBox />}>
        <SearchBoxWithQuery searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Skeleton rows={8} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function SearchBox({ q = "" }: { q?: string }) {
  return (
    <Form action="/search" className="mb-6 flex gap-2">
      <input
        name="q"
        defaultValue={q}
        placeholder="Search TV shows and movies"
        className="input"
        autoFocus
        type="search"
      />
      <button className="btn-primary shrink-0">Search</button>
    </Form>
  );
}

async function SearchBoxWithQuery({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const q = (await searchParams).q;
  return <SearchBox key={String(q ?? "")} q={typeof q === "string" ? q : ""} />;
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim().slice(0, 100) : "";
  const me = await getMe();

  let results: TitleSummary[];
  let fuzzy = false;
  try {
    if (q) {
      ({ results, fuzzy } = await searchTitles(q));
    } else {
      results = await trendingTitles();
    }
  } catch {
    return <Empty>Search isn&apos;t available right now. Check that TMDB_API_KEY is set.</Empty>;
  }

  // Show which results you've already logged.
  const supabase = await createClient();
  const { data: mine } = results.length
    ? await supabase
        .from("watch_entries")
        .select("title_id, status")
        .eq("user_id", me.id)
        .in("title_id", results.map((r) => r.id))
    : { data: [] };
  const statusById = new Map(
    (mine ?? []).map((e: { title_id: string; status: WatchStatus }) => [e.title_id, e.status])
  );

  return (
    <>
      <h2 className="mb-2 text-sm font-medium text-muted">
        {!q
          ? "Trending this week"
          : fuzzy
            ? `No exact matches for “${q}”. Did you mean one of these?`
            : `Results for “${q}”`}
      </h2>
      {results.length === 0 ? (
        <Empty>No shows or movies found.</Empty>
      ) : (
        <div className="grid gap-1 sm:grid-cols-2">
          {results.map((r) => {
            const status = statusById.get(r.id);
            return (
              <TitleRow
                key={r.id}
                id={r.id}
                name={r.name}
                posterPath={r.posterPath}
                year={r.year}
                mediaType={r.mediaType}
              >
                {status ? (
                  <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
                    {STATUS_LABEL[status]}
                  </span>
                ) : (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{r.overview}</p>
                )}
              </TitleRow>
            );
          })}
        </div>
      )}
    </>
  );
}
