import { cacheLife } from "next/cache";
import { queryVariants, rankByQuery, similarity } from "./fuzzy";

// Thin client for The Movie Database (TMDB) API.
// TMDB_API_KEY may be either a v3 API key or a v4 "API Read Access Token".

export type MediaType = "tv" | "movie";

export type TitleSummary = {
  id: string; // "tv-1399" or "movie-603"
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: number | null;
  overview: string;
};

export type TitleDetails = TitleSummary & {
  backdropPath: string | null;
  genres: string[];
  runtime: string | null;
  seasons: number | null;
  status: string | null;
};

const API = "https://api.themoviedb.org/3";

export function titleId(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}-${tmdbId}`;
}

export function parseTitleId(id: string): { mediaType: MediaType; tmdbId: number } | null {
  const match = /^(tv|movie)-(\d{1,10})$/.exec(id);
  if (!match) return null;
  return { mediaType: match[1] as MediaType, tmdbId: Number(match[2]) };
}

export { posterUrl } from "./images";

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");

  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: "application/json" };
  // v4 read access tokens are JWTs; v3 keys are 32 hex characters.
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

type RawResult = {
  id: number;
  media_type?: string;
  name?: string;
  title?: string;
  poster_path?: string | null;
  first_air_date?: string;
  release_date?: string;
  overview?: string;
  popularity?: number;
};

function yearOf(date?: string) {
  const y = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 0 ? y : null;
}

function toSummary(r: RawResult, mediaType: MediaType): TitleSummary {
  return {
    id: titleId(mediaType, r.id),
    mediaType,
    tmdbId: r.id,
    name: (mediaType === "tv" ? r.name : r.title) ?? r.name ?? r.title ?? "Untitled",
    posterPath: r.poster_path ?? null,
    year: yearOf(mediaType === "tv" ? r.first_air_date : r.release_date),
    overview: r.overview ?? "",
  };
}

function onlyShowsAndMovies(results: RawResult[]) {
  return results
    .filter((r) => r.media_type === "tv" || r.media_type === "movie")
    .map((r) => toSummary(r, r.media_type as MediaType));
}

type Candidate = TitleSummary & { popularity?: number };

function candidates(results: RawResult[]): Candidate[] {
  return results
    .filter((r) => r.media_type === "tv" || r.media_type === "movie")
    .map((r) => ({ ...toSummary(r, r.media_type as MediaType), popularity: r.popularity }));
}

async function searchRaw(query: string): Promise<Candidate[]> {
  "use cache";
  cacheLife("hours");
  const data = await tmdb<{ results: RawResult[] }>("/search/multi", {
    query,
    include_adult: "false",
  });
  return candidates(data.results);
}

// A few hundred well-known titles, used to catch typos TMDB's own search
// can't (a misspelling near the start of a word, like "inseption").
async function popularPool(): Promise<Candidate[]> {
  "use cache";
  cacheLife("hours");
  const lists: [string, MediaType | null][] = [
    ["/trending/all/week", null],
    ["/tv/popular", "tv"],
    ["/movie/popular", "movie"],
    ["/tv/top_rated", "tv"],
    ["/movie/top_rated", "movie"],
  ];
  const pages = await Promise.all(
    lists.flatMap(([path, type]) =>
      ["1", "2"].map(async (page) => {
        try {
          const data = await tmdb<{ results: RawResult[] }>(path, { page });
          return candidates(data.results.map((r) => ({ ...r, media_type: r.media_type ?? type ?? undefined })));
        } catch {
          return [];
        }
      })
    )
  );
  return pages.flat();
}

export type SearchResult = {
  results: TitleSummary[];
  // True when nothing matched as typed and these are the closest guesses.
  fuzzy: boolean;
};

const strip = (c: Candidate): TitleSummary => ({
  id: c.id,
  mediaType: c.mediaType,
  tmdbId: c.tmdbId,
  name: c.name,
  posterPath: c.posterPath,
  year: c.year,
  overview: c.overview,
});

export async function searchTitles(query: string): Promise<SearchResult> {
  const exact = await searchRaw(query);
  const good = exact.filter((r) => similarity(query, r.name) >= 0.75);
  if (good.length > 0) return { results: exact.map(strip), fuzzy: false };

  // Nothing close: search looser versions too and rank everything together.
  const [variantResults, pool] = await Promise.all([
    Promise.all(queryVariants(query).map((v) => searchRaw(v).catch(() => []))),
    popularPool(),
  ]);
  const byId = new Map<string, Candidate>();
  for (const r of [...exact, ...variantResults.flat(), ...pool]) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const ranked = rankByQuery(query, [...byId.values()]).slice(0, 20);
  if (ranked.length === 0) return { results: exact.map(strip), fuzzy: false };
  // Keep TMDB's own matches for the query underneath the close guesses.
  const rankedIds = new Set(ranked.map((r) => r.id));
  return {
    results: [...ranked, ...exact.filter((r) => !rankedIds.has(r.id))].map(strip),
    fuzzy: true,
  };
}

export async function trendingTitles(): Promise<TitleSummary[]> {
  "use cache";
  cacheLife("hours");
  const data = await tmdb<{ results: RawResult[] }>("/trending/all/week");
  return onlyShowsAndMovies(data.results);
}

export async function getTitleDetails(id: string): Promise<TitleDetails | null> {
  "use cache";
  cacheLife("days");
  const parsed = parseTitleId(id);
  if (!parsed) return null;

  type Raw = RawResult & {
    backdrop_path?: string | null;
    genres?: { name: string }[];
    runtime?: number;
    episode_run_time?: number[];
    number_of_seasons?: number;
    status?: string;
  };
  let raw: Raw;
  try {
    raw = await tmdb<Raw>(`/${parsed.mediaType}/${parsed.tmdbId}`);
  } catch {
    return null;
  }
  const minutes = parsed.mediaType === "movie" ? raw.runtime : raw.episode_run_time?.[0];
  return {
    ...toSummary(raw, parsed.mediaType),
    backdropPath: raw.backdrop_path ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    runtime: minutes ? `${minutes} min` : null,
    seasons: parsed.mediaType === "tv" ? (raw.number_of_seasons ?? null) : null,
    status: raw.status ?? null,
  };
}

// --- Where to watch (data from JustWatch, via TMDB) ----------------------------

export type Provider = { id: number; name: string; logoPath: string | null };

export type WatchOptions = {
  link: string | null; // TMDB page listing every option for this title
  stream: Provider[]; // included with a subscription
  free: Provider[]; // free, or free with ads
  rentOrBuy: Provider[];
};

type RawProvider = { provider_id: number; provider_name: string; logo_path: string | null; display_priority?: number };
type RawRegion = {
  link?: string;
  flatrate?: RawProvider[];
  free?: RawProvider[];
  ads?: RawProvider[];
  rent?: RawProvider[];
  buy?: RawProvider[];
};

function providers(...lists: (RawProvider[] | undefined)[]): Provider[] {
  const byId = new Map<number, RawProvider>();
  for (const p of lists.flat()) if (p && !byId.has(p.provider_id)) byId.set(p.provider_id, p);
  return [...byId.values()]
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path }));
}

// Streaming availability changes, so refresh a few times a day.
async function allWatchOptions(id: string): Promise<Record<string, RawRegion> | null> {
  "use cache";
  cacheLife("hours");
  const parsed = parseTitleId(id);
  if (!parsed) return null;
  try {
    const data = await tmdb<{ results?: Record<string, RawRegion> }>(
      `/${parsed.mediaType}/${parsed.tmdbId}/watch/providers`
    );
    return data.results ?? {};
  } catch {
    return null;
  }
}

export async function getWatchOptions(id: string, country: string): Promise<WatchOptions | null> {
  const all = await allWatchOptions(id);
  if (!all) return null;
  const region = all[country] ?? {};
  return {
    link: region.link ?? null,
    stream: providers(region.flatrate),
    free: providers(region.free, region.ads),
    rentOrBuy: providers(region.rent, region.buy),
  };
}

// Countries TMDB has streaming data for, for the Settings picker.
export async function watchCountries(): Promise<{ code: string; name: string }[]> {
  "use cache";
  cacheLife("days");
  try {
    const data = await tmdb<{ results: { iso_3166_1: string; english_name: string }[] }>(
      "/watch/providers/regions"
    );
    return data.results
      .map((r) => ({ code: r.iso_3166_1, name: r.english_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// Subscription services available in a country (for the "My services" picker),
// most popular first.
export async function streamingServices(country: string): Promise<Provider[]> {
  "use cache";
  cacheLife("days");
  type Raw = RawProvider & { display_priorities?: Record<string, number> };
  try {
    const [tv, movie] = await Promise.all(
      ["tv", "movie"].map((kind) =>
        tmdb<{ results: Raw[] }>(`/watch/providers/${kind}`, { watch_region: country })
      )
    );
    const byId = new Map<number, Raw>();
    for (const p of [...tv.results, ...movie.results]) if (!byId.has(p.provider_id)) byId.set(p.provider_id, p);
    return [...byId.values()]
      .sort(
        (a, b) =>
          (a.display_priorities?.[country] ?? a.display_priority ?? 999) -
          (b.display_priorities?.[country] ?? b.display_priority ?? 999)
      )
      .slice(0, 60)
      .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path }));
  } catch {
    return [];
  }
}

// For each title, which of these services include it with a subscription
// (or for free) in this country. Looks titles up in parallel; each lookup is
// cached for a few hours.
export async function availableOn(
  titleIds: string[],
  country: string,
  serviceIds: number[]
): Promise<Record<string, string[]>> {
  if (serviceIds.length === 0 || titleIds.length === 0) return {};
  const mine = new Set(serviceIds);
  const unique = [...new Set(titleIds)].slice(0, 80);
  const pairs = await Promise.all(
    unique.map(async (id) => {
      const options = await getWatchOptions(id, country);
      const names = options ? [...options.stream, ...options.free].filter((p) => mine.has(p.id)).map((p) => p.name) : [];
      return [id, names] as const;
    })
  );
  return Object.fromEntries(pairs.filter(([, names]) => names.length > 0));
}
