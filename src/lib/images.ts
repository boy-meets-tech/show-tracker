// TMDB image URLs. Kept apart from tmdb.ts (which is server-only) so client
// components can use it.
export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
