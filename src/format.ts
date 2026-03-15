import type { Screening } from "./types.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FormatMode = "city-today" | "city-week" | "film";

// ── ANSI helpers ──────────────────────────────────────────────────────────────

function makeAnsi(useColor: boolean) {
  const id = (s: string) => s;
  if (!useColor) {
    return { bold: id, dim: id, green: id };
  }
  return {
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  };
}

// ── German date formatting ────────────────────────────────────────────────────

const DE_DAYS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const DE_MONTHS = [
  "",
  "Jan.",
  "Feb.",
  "März",
  "Apr.",
  "Mai",
  "Juni",
  "Juli",
  "Aug.",
  "Sep.",
  "Okt.",
  "Nov.",
  "Dez.",
];

/** Convert ISO date string "2026-03-15" → "So. 15. März" using UTC to avoid TZ shift. */
export function formatDateDE(iso: string): string {
  const d = new Date(iso);
  const day = DE_DAYS[d.getUTCDay()];
  const date = d.getUTCDate();
  const month = DE_MONTHS[d.getUTCMonth() + 1];
  return `${day} ${date}. ${month}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Group items by a key function, preserving insertion order. */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    let group = map.get(key);
    if (!group) {
      group = [];
      map.set(key, group);
    }
    group.push(item);
  }
  return map;
}

/**
 * Returns both the display (possibly ANSI-colored) and plain (uncolored) label for a film.
 * Padding must be computed on plain.length, then applied to display.
 */
function filmLabel(
  s: Screening,
  greenFn: (s: string) => string,
): { display: string; plain: string } {
  if (s.format) {
    return {
      display: `${s.film} (${greenFn(s.format)})`,
      plain: `${s.film} (${s.format})`,
    };
  }
  return { display: s.film, plain: s.film };
}

/**
 * Group screenings by film+format key within a set, collecting deduplicated sorted times.
 * Returns ordered array of { display, plain, times }.
 */
function groupFilmTimes(
  screenings: Screening[],
  greenFn: (s: string) => string,
): Array<{ display: string; plain: string; times: string[] }> {
  // Use a Map keyed by "film||format" to preserve order
  const filmMap = new Map<string, { display: string; plain: string; times: Set<string> }>();

  for (const s of screenings) {
    const key = `${s.film}||${s.format ?? ""}`;
    if (!filmMap.has(key)) {
      const label = filmLabel(s, greenFn);
      filmMap.set(key, { display: label.display, plain: label.plain, times: new Set() });
    }
    filmMap.get(key)!.times.add(s.time);
  }

  return Array.from(filmMap.values()).map(({ display, plain, times }) => ({
    display,
    plain,
    times: Array.from(times).sort(),
  }));
}

// ── Formatter ─────────────────────────────────────────────────────────────────

/**
 * Format an array of screenings into a human-readable string.
 *
 * @param screenings - The screenings to format (should be pre-filtered).
 * @param mode       - Display mode: "city-today", "city-week", or "film".
 * @param useColor   - Whether to emit ANSI escape codes. Defaults to process.stdout.isTTY.
 */
export function formatScreenings(
  screenings: Screening[],
  mode: FormatMode,
  useColor?: boolean,
): string {
  if (screenings.length === 0) return "";

  const color = useColor ?? process.stdout.isTTY ?? false;
  const { bold, dim, green } = makeAnsi(color);

  if (mode === "city-today") {
    return formatCityToday(screenings, bold, dim, green);
  }
  if (mode === "city-week") {
    return formatCityWeek(screenings, bold, dim, green);
  }
  // film mode
  return formatFilm(screenings, bold, green);
}

// ── city-today ────────────────────────────────────────────────────────────────

function formatCityToday(
  screenings: Screening[],
  bold: (s: string) => string,
  dim: (s: string) => string,
  green: (s: string) => string,
): string {
  const byCinema = groupBy(screenings, (s) => s.cinema);
  const blocks: string[] = [];

  for (const [cinema, cinemaScreenings] of byCinema) {
    const lines: string[] = [];

    // Cinema header: bold cinema · dim address
    const address = cinemaScreenings[0].address;
    lines.push(`${bold(cinema)} · ${dim(address)}`);

    // Group films within this cinema
    const films = groupFilmTimes(cinemaScreenings, green);
    const maxPlainLen = Math.max(...films.map((f) => f.plain.length));

    for (const { display, plain, times } of films) {
      const padding = " ".repeat(maxPlainLen - plain.length + 2);
      lines.push(`  ${display}${padding}${times.join("  ")}`);
    }

    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n") + "\n";
}

// ── city-week ─────────────────────────────────────────────────────────────────

function formatCityWeek(
  screenings: Screening[],
  bold: (s: string) => string,
  dim: (s: string) => string,
  green: (s: string) => string,
): string {
  // Sort dates chronologically
  const byDate = groupBy(screenings, (s) => s.date);
  const sortedDates = Array.from(byDate.keys()).sort();

  const dateBlocks: string[] = [];

  for (const date of sortedDates) {
    const dateScreenings = byDate.get(date)!;
    const lines: string[] = [];

    // Date header
    lines.push(bold(formatDateDE(date)));

    const byCinema = groupBy(dateScreenings, (s) => s.cinema);
    const cinemaBlocks: string[] = [];

    for (const [cinema, cinemaScreenings] of byCinema) {
      const cinemaLines: string[] = [];
      cinemaLines.push(`  ${bold(cinema)}`);

      const films = groupFilmTimes(cinemaScreenings, green);
      const maxPlainLen = Math.max(...films.map((f) => f.plain.length));

      for (const { display, plain, times } of films) {
        const padding = " ".repeat(maxPlainLen - plain.length + 2);
        cinemaLines.push(`    ${display}${padding}${times.join("  ")}`);
      }

      cinemaBlocks.push(cinemaLines.join("\n"));
    }

    lines.push(cinemaBlocks.join("\n\n"));
    dateBlocks.push(lines.join("\n"));
  }

  return dateBlocks.join("\n\n") + "\n";
}

// ── film mode ─────────────────────────────────────────────────────────────────

function formatFilm(
  screenings: Screening[],
  bold: (s: string) => string,
  _green: (s: string) => string,
): string {
  const byCity = groupBy(screenings, (s) => s.city ?? "Unknown");
  const blocks: string[] = [];

  for (const [city, cityScreenings] of byCity) {
    const lines: string[] = [];
    lines.push(bold(city));

    const byCinema = groupBy(cityScreenings, (s) => s.cinema);

    for (const [cinema, cinemaScreenings] of byCinema) {
      // Deduplicate and sort times
      const times = Array.from(new Set(cinemaScreenings.map((s) => s.time))).sort();
      lines.push(`  ${bold(cinema)}  ${times.join("  ")}`);
    }

    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n") + "\n";
}
