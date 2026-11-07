// Helpers for typo-tolerant title search. TMDB only matches words that are
// spelled correctly (or are a prefix of the real word), so we search a few
// looser versions of the query and rank everything by how close it is.

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

// Number of single-letter typos (insert, delete, replace, or swap two
// neighbouring letters) between a and b.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
    }
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

function wordSimilarity(a: string, b: string): number {
  // Typing the start of a word ("strang" for "stranger") counts as a match.
  if (b.startsWith(a) && a.length >= 3) return 0.9 + 0.1 * (a.length / b.length);
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

function dice(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return (2 * shared) / (ta.size + tb.size || 1);
}

// 0 (nothing alike) to 1 (same title).
export function similarity(query: string, title: string): number {
  const q = normalize(query);
  const t = normalize(title);
  if (!q || !t) return 0;
  if (q === t) return 1;

  // How well each word typed matches its closest word in the title.
  const titleWords = t.split(" ");
  const queryWords = q.split(" ");
  const perWord =
    queryWords.reduce(
      (sum, w) => sum + Math.max(...titleWords.map((tw) => wordSimilarity(w, tw))),
      0
    ) / queryWords.length;
  // Small penalty for titles with many extra words ("Things" vs "Stranger Things").
  const coverage = Math.min(1, queryWords.length / titleWords.length);
  const wordScore = perWord * (0.85 + 0.15 * coverage);

  return Math.max(dice(q, t), wordScore);
}

// Looser versions of a query to try when the exact search finds little.
export function queryVariants(query: string, max = 6): string[] {
  const original = query.trim().toLowerCase();
  const ws = words(query);
  const out = new Set<string>();
  const add = (v: string) => {
    const s = v.trim();
    if (s.length >= 2 && s !== original) out.add(s);
  };

  add(ws.join(" "));
  // Keep the start of each long word, since TMDB matches word prefixes.
  // Fixes typos near the end of a word ("strangr" -> "stran").
  add(ws.map((w) => (w.length > 4 ? w.slice(0, Math.max(3, Math.ceil(w.length * 0.6))) : w)).join(" "));
  // Drop one word at a time, longest first, to get around a single misspelled word.
  if (ws.length > 1) {
    [...ws]
      .map((w, i) => ({ w, i }))
      .sort((a, b) => b.w.length - a.w.length)
      .forEach(({ i }) => add(ws.filter((_, j) => j !== i).join(" ")));
  }
  // Single word: also try a shorter start of it.
  if (ws.length === 1 && ws[0].length > 5) add(ws[0].slice(0, 4));
  return [...out].slice(0, max);
}

// Sort candidates by closeness to the query, with a nudge for popular titles,
// and drop ones that clearly aren't what was meant.
export function rankByQuery<T extends { name: string; popularity?: number }>(
  query: string,
  items: T[],
  minScore = 0.45
): T[] {
  const scored = items.map((item) => {
    const pop = Math.min(1, Math.log10((item.popularity ?? 0) + 1) / 3);
    const match = similarity(query, item.name);
    return { item, match, score: match + 0.08 * pop };
  });
  return scored
    .filter((s) => s.match >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}
