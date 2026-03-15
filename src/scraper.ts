import { parse as parseHTML } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import type { Screening } from "./types.ts";

// German month name → 1-based month number
const GERMAN_MONTHS: Record<string, number> = {
  jan: 1,
  januar: 1,
  feb: 2,
  februar: 2,
  mär: 3,
  märz: 3,
  mar: 3,
  apr: 4,
  april: 4,
  mai: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dez: 12,
  dezember: 12,
};

/**
 * Parse `<div class="day">` headers from the page root and return ISO date strings.
 * The number of elements equals the number of day columns on the page (4–8).
 *
 * Handles Dec→Jan year rollover: if the current month is December and the parsed
 * month is January, the year is incremented.
 */
export function parseDayHeaders(root: HTMLElement): string[] {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-indexed

  return root.querySelectorAll("div.day").map((el) => {
    const text = el.textContent.trim(); // e.g. "So. 15. März"
    const parts = text.split(/\s+/);

    let day = 0;
    let month = 0;

    for (const part of parts) {
      const stripped = part.replace(/\.$/, ""); // remove trailing period
      const num = parseInt(stripped, 10);
      if (!isNaN(num) && String(num) === stripped) {
        day = num;
      } else {
        const m = GERMAN_MONTHS[stripped.toLowerCase()];
        if (m) month = m;
      }
    }

    let year = currentYear;
    // Dec→Jan rollover
    if (currentMonth === 12 && month === 1) {
      year = currentYear + 1;
    }

    // Parsing failed for this header — return empty marker so callers can skip
    if (day < 1 || month < 1) {
      return "";
    }

    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  });
}

/**
 * Parse `div.mi` metadata text into structured fields.
 * Separator is `•` (U+2022). Segments are trimmed.
 *
 * Example input: "Drama, Thriller • 2016 • 1 Std. 56 Min. • FSK 12"
 */
export function parseMetadataText(text: string): {
  genres: string[];
  year?: number;
  runtime?: string;
  fsk?: string;
} {
  // Split on both • (U+2022) and · (U+00B7) for robustness
  const segments = text
    .split(/[•·]/)
    .map((s) => s.trim())
    .filter(Boolean);

  let genres: string[] = [];
  let year: number | undefined;
  let runtime: string | undefined;
  let fsk: string | undefined;

  for (const seg of segments) {
    if (/^\d{4}$/.test(seg)) {
      year = parseInt(seg, 10);
    } else if (/\d+\s*Std\.|\d+\s*Min\./.test(seg)) {
      runtime = seg;
    } else if (/^FSK\b/i.test(seg)) {
      fsk = seg;
    } else {
      // genre segment — may contain multiple genres separated by comma
      genres.push(
        ...seg
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
      );
    }
  }

  return { genres, year, runtime, fsk };
}

interface FilmInfo {
  film: string;
  format?: string;
  genres: string[];
  year?: number;
  runtime?: string;
  fsk?: string;
  description: string;
}

/**
 * Parse a single `<div class="c">` cinema block and its associated `<p>` time-slot
 * elements into `Screening` objects.
 *
 * Each `<p>` corresponds to one day column (positional index into `dates`).
 * - `<a>` children → future screenings with ticketUrl
 * - `<span class="past">` children → past screenings
 */
function parseCinemaBlock(
  cinemaEl: HTMLElement,
  pEls: HTMLElement[],
  dates: string[],
  filmInfo: FilmInfo,
): Screening[] {
  // Cinema name: first <a> child of div.c
  const cinemaLink = cinemaEl.querySelector("a");
  const cinema = cinemaLink?.textContent.trim() ?? "";

  // Address div: first <div> child inside div.c
  const addrDiv = cinemaEl.querySelector("div");
  const addrText = addrDiv?.textContent.trim() ?? "";
  // Address is the text before the bullet separator (real site: •, docs: ·)
  const address = addrText.split(/[•·]/)[0].trim();

  // City (film mode only): <a> in address div where href is /programm?stadt=X
  // with no &bezirk= or &kino= params (those are city-mode district/cinema links)
  let city: string | undefined;
  if (addrDiv) {
    for (const a of addrDiv.querySelectorAll("a")) {
      const href = a.getAttribute("href") ?? "";
      if (href.includes("?stadt=") && !href.includes("&bezirk=") && !href.includes("&kino=")) {
        city = a.textContent.trim();
        break;
      }
    }
  }

  const result: Screening[] = [];

  pEls.forEach((pEl, dateIndex) => {
    if (dateIndex >= dates.length) return;
    const date = dates[dateIndex];
    if (!date) return;

    // Future screenings: <a> elements
    for (const a of pEl.querySelectorAll("a")) {
      const time = a.textContent.trim();
      if (!time) continue;
      const href = a.getAttribute("href");
      const ticketUrl = href
        ? href.startsWith("http")
          ? href
          : `https://allekinos.de${href}`
        : undefined;
      result.push({
        ...filmInfo,
        cinema,
        address,
        city,
        date,
        time,
        isPast: false,
        ticketUrl,
      });
    }

    // Past screenings: <span class="past"> elements
    for (const span of pEl.querySelectorAll("span.past")) {
      const time = span.textContent.trim();
      if (!time) continue;
      result.push({
        ...filmInfo,
        cinema,
        address,
        city,
        date,
        time,
        isPast: true,
      });
    }
  });

  return result;
}

/**
 * Parse a full allekinos.de program HTML page into a flat array of `Screening`
 * objects. Works for both city mode (`?stadt=`) and film mode (`?film=`).
 *
 * Page structure (inside `div.movies`):
 * - N × `div.day` headers (day column count; usually 4–8)
 * - N × `div.mp` + `div.row` pairs (one film per row)
 *
 * Each `div.row` children (in order):
 * 1. `div.mt` — film metadata (title, genres, description)
 * 2. `p.e` — spacer (skip)
 * 3. `div.c` → N × `<p>` — cinema block + time-slot columns (repeats per cinema)
 */
export function parsePage(html: string): Screening[] {
  const root = parseHTML(html);
  const dates = parseDayHeaders(root);
  const screenings: Screening[] = [];

  for (const rowEl of root.querySelectorAll("div.row")) {
    // ── Film metadata ──────────────────────────────────────────────────────────
    const mt = rowEl.querySelector("div.mt");
    if (!mt) continue;

    const h2 = mt.querySelector("h2");
    if (!h2) continue;

    // Title: prefer <a> child (city mode), fallback to h2 text (film mode)
    const titleLink = h2.querySelector("a");
    let film: string;
    let format: string | undefined;

    if (titleLink) {
      film = titleLink.textContent.trim();
      // Format suffix: h2 text after the linked title — e.g. " (OV, 3D)"
      const h2Text = h2.textContent.trim();
      const afterTitle = h2Text.slice(film.length).trim();
      if (afterTitle) {
        // Strip outer parentheses: "(OV)" → "OV"
        const stripped = afterTitle.replace(/^\(|\)$/g, "").trim();
        if (stripped) format = stripped;
      }
    } else {
      film = h2.textContent.trim();
    }

    if (!film) continue;

    const mi = mt.querySelector("div.mi");
    const { genres, year, runtime, fsk } = parseMetadataText(mi?.textContent.trim() ?? "");

    const md = mt.querySelector("div.md");
    const descriptionTitle = md?.getAttribute("title")?.trim();
    const description = descriptionTitle || md?.textContent.trim() || "";

    const filmInfo: FilmInfo = { film, format, genres, year, runtime, fsk, description };

    // ── Cinema blocks ──────────────────────────────────────────────────────────
    // Iterate direct element children sequentially. When we encounter a div.c,
    // we collect the following <p> elements as time-slot columns.
    const children = rowEl.children; // HTMLElement[] — no text nodes

    let currentCinema: HTMLElement | null = null;
    let currentPs: HTMLElement[] = [];

    for (const child of children) {
      const tag = child.tagName?.toLowerCase();
      const cls = child.getAttribute("class") ?? "";
      const classes = cls.split(/\s+/);

      if (tag === "div" && classes.includes("c")) {
        // Flush previous cinema block
        if (currentCinema !== null) {
          screenings.push(...parseCinemaBlock(currentCinema, currentPs, dates, filmInfo));
        }
        currentCinema = child;
        currentPs = [];
      } else if (tag === "p" && !classes.includes("e")) {
        // Collect time-slot column (skip p.e spacers)
        if (currentCinema !== null) {
          currentPs.push(child);
        }
      }
      // div.mt is also a child — already handled above, implicitly skipped here
    }

    // Flush last cinema block
    if (currentCinema !== null) {
      screenings.push(...parseCinemaBlock(currentCinema, currentPs, dates, filmInfo));
    }
  }

  return screenings;
}

/**
 * Fetch and parse the program for a specific city.
 * Returns all screenings across all cinemas and films in that city.
 * The `city` field on each `Screening` will be `undefined` (city is implicit).
 */
export async function scrapeCity(city: string): Promise<Screening[]> {
  const url = `https://allekinos.de/programm?stadt=${encodeURIComponent(city)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "allekinos-cli/0.1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  return parsePage(html);
}

/**
 * Fetch and parse screenings for a specific film across all cities.
 * The `city` field on each `Screening` is populated from the cinema address link.
 */
export async function scrapeFilm(film: string): Promise<Screening[]> {
  const url = `https://allekinos.de/programm?film=${encodeURIComponent(film)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "allekinos-cli/0.1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  return parsePage(html);
}
