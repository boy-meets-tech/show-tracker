import { cacheLife } from "next/cache";

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

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

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

export async function searchTitles(query: string): Promise<TitleSummary[]> {
  "use cache";
  cacheLife("hours");
  const data = await tmdb<{ results: RawResult[] }>("/search/multi", {
    query,
    include_adult: "false",
  });
  return onlyShowsAndMovies(data.results);
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
