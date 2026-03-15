#!/usr/bin/env bun
import { scrapeCity, scrapeFilm } from "./scraper.ts";
import { clearCache, resolveCity, AmbiguousCityError, UnknownCityError } from "./cities.ts";

const VERSION = "0.1.0";

const USAGE = `Usage: allekinos <city> [options]
       allekinos --film <name> [options]

Options:
  --film, -f <name>   Search for a specific film across all cities
  --ov                Filter to original version (OV/OmU/OmeU) screenings
  --genre, -g <name>  Filter by genre (case-insensitive substring match)
  --today, -t         Show only today's screenings
  --json              Output as JSON
  --clear-cache       Clear the city name cache
  --help, -h          Show this help
  --version, -v       Show version
`;

interface Options {
  city?: string;
  film?: string;
  ov: boolean;
  genre?: string;
  today: boolean;
  json: boolean;
  clearCacheFlag: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(args: string[]): Options {
  const opts: Options = {
    ov: false,
    today: false,
    json: false,
    clearCacheFlag: false,
    help: false,
    version: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "--film":
      case "-f":
        opts.film = args[++i];
        break;
      case "--genre":
      case "-g":
        opts.genre = args[++i];
        break;
      case "--ov":
        opts.ov = true;
        break;
      case "--today":
      case "-t":
        opts.today = true;
        break;
      case "--json":
        opts.json = true;
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
        if (!arg.startsWith("-") && opts.city === undefined) {
          opts.city = arg;
        }
        break;
    }
    i++;
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
  const opts = parseArgs(process.argv.slice(2));

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

  let screenings;

  if (opts.film) {
    try {
      screenings = await scrapeFilm(opts.film);
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  } else if (opts.city) {
    let resolved: string;
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
      screenings = await scrapeCity(resolved);
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

  // 3. Genre filter
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

  // Output
  console.log(JSON.stringify(screenings, null, 2));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
