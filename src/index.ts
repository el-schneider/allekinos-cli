#!/usr/bin/env bun
import { scrapeCity, scrapeFilm } from "./scraper.ts";
import {
  clearCache,
  getCities,
  resolveCity,
  AmbiguousCityError,
  UnknownCityError,
} from "./cities.ts";
import { formatScreenings, type FormatMode } from "./format.ts";

const VERSION = "0.1.0";

const USAGE = `Usage: allekinos <city> [options]
       allekinos --film <name> [options]

Options:
  --film, -f <name>   Search for a specific film across all cities
  --ov                Filter to original version (OV/OmU/OmeU) screenings
  --genre, -g <name>  Filter by genre (case-insensitive substring match)
  --today, -t         Show only today's screenings
  --week, -w          Show the full week (default behavior)
  --json              Output as JSON
  --cities            List all known cities
  --clear-cache       Clear the city name cache
  --help, -h          Show this help
  --version, -v       Show version
`;

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

interface Options {
  city?: string;
  film?: string;
  ov: boolean;
  genre?: string;
  today: boolean;
  week: boolean;
  json: boolean;
  citiesFlag: boolean;
  clearCacheFlag: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgs(args: string[]): Options {
  const opts: Options = {
    ov: false,
    today: false,
    week: false,
    json: false,
    citiesFlag: false,
    clearCacheFlag: false,
    help: false,
    version: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "--film":
      case "-f": {
        const val = args[i + 1];
        if (val === undefined || val === "" || val.startsWith("-")) {
          throw new CliUsageError(`Option ${arg} requires a non-empty value.`);
        }
        opts.film = val;
        i++;
        break;
      }
      case "--genre":
      case "-g": {
        const val = args[i + 1];
        if (val === undefined || val === "" || val.startsWith("-")) {
          throw new CliUsageError(`Option ${arg} requires a non-empty value.`);
        }
        opts.genre = val;
        i++;
        break;
      }
      case "--ov":
        opts.ov = true;
        break;
      case "--today":
      case "-t":
        opts.today = true;
        break;
      case "--week":
      case "-w":
        opts.week = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--cities":
        opts.citiesFlag = true;
        break;
      case "--clear-cache":
        opts.clearCacheFlag = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--version":
      case "-v":
        opts.version = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new CliUsageError(`Unknown flag: ${arg}`);
        }
        if (opts.city !== undefined) {
          throw new CliUsageError(
            `Unexpected argument "${arg}". Did you mean to quote a multi-word city name? e.g. "Frankfurt am Main"`,
          );
        }
        opts.city = arg;
        break;
    }
    i++;
  }

  if (opts.week && opts.today) {
    throw new CliUsageError("--week and --today are mutually exclusive.");
  }

  return opts;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const OV_KEYWORDS = ["ov", "omu", "omeu"];

function isOV(format?: string): boolean {
  if (!format) return false;
  const lower = format.toLowerCase();
  return OV_KEYWORDS.some((kw) => lower.includes(kw));
}

async function main(): Promise<void> {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliUsageError) {
      process.stderr.write(`Error: ${err.message}\n\n${USAGE}`);
      process.exit(1);
    }
    throw err;
  }

  // Priority routing
  if (opts.clearCacheFlag) {
    clearCache();
    console.log("City cache cleared.");
    process.exit(0);
  }

  if (opts.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (opts.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (opts.citiesFlag) {
    try {
      const cities = await getCities();
      console.log(cities.join("\n"));
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  let screenings;
  let resolved: string | undefined;

  if (opts.film && !opts.city) {
    // Film search everywhere (no city given)
    try {
      screenings = await scrapeFilm(opts.film);
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  } else if (opts.city) {
    try {
      resolved = await resolveCity(opts.city);
    } catch (err) {
      if (err instanceof AmbiguousCityError) {
        process.stderr.write(`Ambiguous city. Did you mean: ${err.candidates.join(", ")}?\n`);
      } else if (err instanceof UnknownCityError) {
        process.stderr.write(`Unknown city: "${err.query}"\n`);
      } else {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      }
      process.exit(1);
    }
    try {
      screenings = await scrapeCity(resolved!);
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  } else {
    process.stderr.write(USAGE);
    process.exit(1);
  }

  // Filter pipeline
  // 1. Always remove past screenings
  screenings = screenings.filter((s) => !s.isPast);

  // 2. OV filter
  if (opts.ov) {
    screenings = screenings.filter((s) => isOV(s.format));
  }

  // 3. Film filter (city + --film mode)
  if (opts.film && opts.city) {
    const filmLower = opts.film.toLowerCase();
    screenings = screenings.filter((s) => s.film.toLowerCase().includes(filmLower));
  }

  // 4. Genre filter
  if (opts.genre) {
    const genreLower = opts.genre.toLowerCase();
    screenings = screenings.filter((s) =>
      s.genres.some((g) => g.toLowerCase().includes(genreLower)),
    );
  }

  // 4. Today filter
  if (opts.today) {
    const today = todayISO();
    screenings = screenings.filter((s) => s.date === today);
  }

  // Determine display mode
  // "film" mode = --film without city (shows results grouped by city)
  // city+film = same as city mode, just filtered
  const mode: FormatMode =
    opts.film && !opts.city ? "film" : opts.today ? "city-today" : "city-week";

  // Output
  if (opts.json) {
    console.log(JSON.stringify(screenings, null, 2));
  } else if (screenings.length === 0) {
    if (opts.film && !opts.city) {
      process.stderr.write(`No screenings found for "${opts.film}".\n`);
    } else if (opts.film && opts.city) {
      process.stderr.write(`No screenings of "${opts.film}" in ${resolved ?? opts.city}.\n`);
    } else if (opts.today) {
      process.stderr.write(
        `No screenings in ${resolved ?? opts.city} for today. Try without --today for the full week.\n`,
      );
    } else {
      process.stderr.write(`No screenings in ${resolved ?? opts.city} for this week.\n`);
    }
    process.exit(1);
  } else {
    process.stdout.write(formatScreenings(screenings, mode));
  }
  process.exit(0);
}

// Support both Bun (import.meta.main) and Node (direct execution)
const isMain =
  typeof (import.meta as Record<string, unknown>).main === "boolean"
    ? (import.meta as Record<string, unknown>).main
    : true;

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
