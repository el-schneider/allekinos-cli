import { existsSync, mkdirSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parse as parseHTML } from "node-html-parser";

const CACHE_DIR = join(homedir(), ".allekinos", "cache");
const CACHE_FILE = join(CACHE_DIR, "cities.json");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CityCache {
  fetchedAt: string;
  cities: string[];
}

export class AmbiguousCityError extends Error {
  candidates: string[];
  constructor(candidates: string[]) {
    super(`Ambiguous city. Did you mean: ${candidates.join(", ")}?`);
    this.name = "AmbiguousCityError";
    this.candidates = candidates;
  }
}

export class UnknownCityError extends Error {
  query: string;
  constructor(query: string) {
    super(`Unknown city: "${query}"`);
    this.name = "UnknownCityError";
    this.query = query;
  }
}

/** Normalize German umlauts and ß to ASCII equivalents for comparison. */
export function normalizeUmlauts(s: string): string {
  return s
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ä/g, "a")
    .replace(/ß/g, "ss")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ä/g, "A");
}

/** Standard dynamic-programming Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Fetch the list of cities from allekinos.de (or return a cached copy).
 * Cache is stored at `~/.allekinos/cache/cities.json` with a 30-day TTL.
 */
export async function getCities(): Promise<string[]> {
  // Try cache first
  if (existsSync(CACHE_FILE)) {
    try {
      const cache = (await Bun.file(CACHE_FILE).json()) as CityCache;
      const age = Date.now() - new Date(cache.fetchedAt).getTime();
      if (age < CACHE_TTL_MS && Array.isArray(cache.cities) && cache.cities.length > 0) {
        return cache.cities;
      }
    } catch {
      // Cache unreadable — fall through to fetch
    }
  }

  // Fetch from allekinos.de homepage
  const response = await fetch("https://allekinos.de/", {
    headers: { "User-Agent": "allekinos-cli/0.1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch city list: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const root = parseHTML(html);

  const citySet = new Set<string>();
  for (const el of root.querySelectorAll("a.city")) {
    const name = el.textContent.trim();
    if (name) citySet.add(name);
  }

  const cities = [...citySet].sort();

  if (cities.length === 0) {
    process.stderr.write(
      "Warning: Could not parse city list from allekinos.de. City matching may not work.\n",
    );
  }

  // Persist cache
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheData: CityCache = { fetchedAt: new Date().toISOString(), cities };
  await Bun.write(CACHE_FILE, JSON.stringify(cacheData, null, 2));

  return cities;
}

/** Delete the cached city list. */
export function clearCache(): void {
  if (existsSync(CACHE_FILE)) {
    rmSync(CACHE_FILE);
  }
}

/**
 * Pure matching function — resolves a city query against a given list.
 * Exported for testability without mocking `getCities`.
 *
 * Matching order (all comparisons are case-insensitive + umlaut-normalised):
 *   1. Exact match
 *   2. Starts-with (prefix) match — throws `AmbiguousCityError` if >1 match
 *   3. Levenshtein fuzzy match — threshold 1 for short queries (≤4 chars), 2 otherwise
 *   4. If still nothing → throws `UnknownCityError`
 */
export function resolveCityFromList(query: string, cities: string[]): string {
  const normQuery = normalizeUmlauts(query).toLowerCase();

  // 1. Exact match
  for (const city of cities) {
    if (normalizeUmlauts(city).toLowerCase() === normQuery) {
      return city;
    }
  }

  // 2. Prefix (starts-with) match
  const prefixMatches = cities.filter((city) =>
    normalizeUmlauts(city).toLowerCase().startsWith(normQuery),
  );
  if (prefixMatches.length === 1) return prefixMatches[0];
  if (prefixMatches.length > 1) throw new AmbiguousCityError(prefixMatches);

  // 3. Levenshtein fuzzy match
  const maxDist = normQuery.length <= 4 ? 1 : 2;
  const fuzzyMatches = cities.filter((city) => {
    const normCity = normalizeUmlauts(city).toLowerCase();
    return levenshtein(normQuery, normCity) <= maxDist;
  });
  if (fuzzyMatches.length === 1) return fuzzyMatches[0];
  if (fuzzyMatches.length > 1) throw new AmbiguousCityError(fuzzyMatches);

  throw new UnknownCityError(query);
}

/** Resolve a city query to the correctly-cased city name used by allekinos.de. */
export async function resolveCity(query: string): Promise<string> {
  const cities = await getCities();
  return resolveCityFromList(query, cities);
}
