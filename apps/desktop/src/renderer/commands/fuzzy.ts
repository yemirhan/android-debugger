/**
 * Small fuzzy matcher for the command panel. Pure and dependency-free so it
 * can be unit-tested from node (see src/main/command-fuzzy.test.ts).
 *
 * Ranking, best first: whole-string prefix, word-start substring, plain
 * substring, then subsequence matches that favour word starts and runs of
 * consecutive characters ("sd" → "Switch device", "fstop" → "Force stop").
 */

export interface FuzzyMatch {
  score: number;
  /** Indices in the text that matched, for highlighting. */
  indices: number[];
}

const SEPARATORS = new Set([' ', '-', '_', '/', '.', ':', '(', ')', '›', '…', ',']);

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1];
  if (SEPARATORS.has(previous)) return true;
  // camelCase / PascalCase boundary ("WebSocket" → "S")
  const current = text[index];
  return previous === previous.toLowerCase() && current !== current.toLowerCase();
}

function range(start: number, length: number): number[] {
  return Array.from({ length }, (_, offset) => start + offset);
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();

  // Substring matches: prefer the occurrence that starts a word.
  let best: FuzzyMatch | null = null;
  for (let index = t.indexOf(q); index !== -1; index = t.indexOf(q, index + 1)) {
    const score =
      100 +
      (index === 0 ? 60 : isWordStart(text, index) ? 40 : 0) +
      (q.length / t.length) * 20 -
      index * 0.5;
    if (!best || score > best.score) best = { score, indices: range(index, q.length) };
  }
  if (best) return best;

  // Subsequence match. Greedy, but jumps ahead to a word start when the
  // character also appears there, which gives far more natural highlights.
  const compact = q.replace(/\s+/g, '');
  const indices: number[] = [];
  let score = 0;
  let cursor = 0;
  for (const char of compact) {
    let found = -1;
    let wordStart = -1;
    for (let index = cursor; index < t.length; index += 1) {
      if (t[index] !== char) continue;
      if (found === -1) found = index;
      if (isWordStart(text, index)) {
        wordStart = index;
        break;
      }
    }
    if (found === -1) return null;
    // Keep a consecutive run going rather than hopping to a later word start.
    const previous = indices[indices.length - 1];
    const index = previous !== undefined && found === previous + 1 ? found : wordStart !== -1 ? wordStart : found;
    const consecutive = previous !== undefined && index === previous + 1;
    score += 10 + (isWordStart(text, index) ? 12 : 0) + (consecutive ? 8 : 0) - Math.min(index - cursor, 10) * 0.8;
    indices.push(index);
    cursor = index + 1;
  }

  // Scattered single-character hits across a long title are mostly noise.
  const wordStarts = indices.filter((index) => isWordStart(text, index)).length;
  if (compact.length >= 3 && wordStarts === 0 && score < compact.length * 8) return null;
  return { score: Math.min(score, 99), indices };
}

export interface SearchableFields {
  title: string;
  keywords?: readonly string[];
  group?: string;
}

/**
 * Scores an item for a (possibly multi-word) query. The whole query is tried
 * against the title first; otherwise every word must match the title, a
 * keyword or the group name.
 */
export function scoreItem(query: string, item: SearchableFields): FuzzyMatch | null {
  const q = query.trim();
  if (!q) return { score: 0, indices: [] };

  const whole = fuzzyMatch(q, item.title);
  if (whole && whole.score >= 100) return whole;

  const words = q.split(/\s+/);
  let total = 0;
  const indices = new Set<number>();
  for (const word of words) {
    const title = fuzzyMatch(word, item.title);
    let bestKeyword = 0;
    for (const keyword of item.keywords ?? []) {
      const match = fuzzyMatch(word, keyword);
      if (match && match.score >= 100) bestKeyword = Math.max(bestKeyword, match.score * 0.7);
    }
    const group = item.group ? fuzzyMatch(word, item.group) : null;
    const groupScore = group && group.score >= 100 ? group.score * 0.4 : 0;
    const titleScore = title?.score ?? 0;
    const bestScore = Math.max(titleScore, bestKeyword, groupScore);
    if (bestScore <= 0) return whole;
    if (title && titleScore === bestScore) title.indices.forEach((index) => indices.add(index));
    total += bestScore;
  }
  const combined = { score: total / words.length, indices: [...indices].sort((a, b) => a - b) };
  return whole && whole.score >= combined.score ? whole : combined;
}
