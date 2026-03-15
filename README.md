# allekinos-cli

CLI wrapper for [allekinos.de](https://allekinos.de) — look up cinema showtimes across Germany.

## Installation

```sh
# Install globally with Bun (recommended)
bun add -g allekinos-cli

# Or run without installing
npx allekinos-cli Berlin
```

## Usage Examples

```sh
# Show full week of screenings in a city (default)
allekinos Berlin

# Show only today's screenings
allekinos Berlin --today

# Explicit full-week view
allekinos Berlin --week

# Original-version screenings only (OV / OmU / OmeU)
allekinos Berlin --ov

# Filter by genre (case-insensitive substring)
allekinos Berlin --genre Drama

# Search for a film across all cities
allekinos --film "Dune"

# List all cities known to allekinos.de
allekinos --cities

# JSON output (great for scripting / AI agents)
allekinos Berlin --json

# Combine filters
allekinos München --ov --today --json
```

## Flag Reference

| Flag             | Short | Description                                                           |
| ---------------- | ----- | --------------------------------------------------------------------- |
| `<city>`         | —     | City name (positional). Quote multi-word names: `"Frankfurt am Main"` |
| `--film <name>`  | `-f`  | Search for a film across all cities                                   |
| `--ov`           | —     | Filter to original-version screenings (OV / OmU / OmeU)               |
| `--genre <name>` | `-g`  | Filter by genre (case-insensitive substring match)                    |
| `--today`        | `-t`  | Show only today's screenings                                          |
| `--week`         | `-w`  | Show the full week (default behavior)                                 |
| `--json`         | —     | Output as JSON array of `Screening` objects                           |
| `--cities`       | —     | Print all known city names, one per line                              |
| `--clear-cache`  | —     | Clear the cached city list                                            |
| `--help`         | `-h`  | Show usage help                                                       |
| `--version`      | `-v`  | Show version                                                          |

`--week` and `--today` are mutually exclusive.

## City Matching

City names are matched fuzzily — exact match first, then prefix, then
[Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance).
This means:

- Omitting umlauts works: `tubingen` → `Tübingen`, `munchen` → `München`
- Prefix works: `Frank` → `Frankfurt am Main` (if unambiguous)
- If multiple cities match, the CLI prints candidates and exits with an error

## JSON Output

Use `--json` to get a machine-readable array of `Screening` objects:

```json
[
  {
    "film": "The Substance",
    "format": "OmU",
    "genres": ["Horror", "Drama"],
    "year": 2024,
    "runtime": "2 Std. 20 Min.",
    "fsk": "FSK 16",
    "description": "A fading celebrity uses a black-market substance…",
    "cinema": "Kino Atelier",
    "address": "Invalidenstr. 50 • Mitte",
    "city": "Berlin",
    "date": "2026-03-15",
    "time": "20:30",
    "isPast": false,
    "ticketUrl": "https://kinotickets.express/…"
  }
]
```

`city` is populated only in `--film` mode (each result may come from a different city).

## For AI Agents / Programmatic Use

- All data goes to **stdout**; errors go to **stderr**
- Use `--json` for structured output — returns an array of `Screening` objects
- Quote multi-word city names: `allekinos "Frankfurt am Main" --json`
- Use `--cities` to discover valid city names: returns a newline-separated list

**Common patterns:**

| Goal                        | Command                           |
| --------------------------- | --------------------------------- |
| What's playing today?       | `allekinos <city> --today --json` |
| Find OV screenings          | `allekinos <city> --ov --json`    |
| Is film X playing?          | `allekinos --film "X" --json`     |
| Which cities are supported? | `allekinos --cities`              |
| Full week in JSON           | `allekinos <city> --json`         |

**Exit codes:** `0` = success, `1` = error (unknown city, no results, bad flags, network error).

## Attribution

Data from [allekinos.de](https://allekinos.de). This is an unofficial CLI tool, not affiliated with allekinos.de.
