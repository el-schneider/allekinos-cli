# AGENTS.md

## Tooling

- Linter: `oxlint` — run `bun run lint`
- Formatter: `oxfmt` — run `bun run fmt` before committing
- Runtime: Bun — use `bun run`, not `node` or `npx`

## allekinos.de HTML Parsing Gotchas

### City names are case-sensitive

`/programm?stadt=berlin` returns a near-empty page (only 1 day header). Use `Berlin` not `berlin`.

### Separator in `div.mi` is `•` (U+2022 BULLET), not `·` (U+00B7 MIDDLE DOT)

Design docs say middle dot; the real site uses the bullet character. Code handles both.

### `div.row` contains MULTIPLE cinema blocks per film

Structure: `div.mt` (1×) → `p.e` (spacer, skip) → repeating `(div.c + N×p)`.
Each `div.c` is followed by exactly N `<p>` elements where N = number of `div.day` headers.
Do NOT use `querySelectorAll("p")` on the row — iterate children sequentially.

### Number of day columns varies (not always 8)

City mode typically shows 8 days; film mode shows 4 or fewer. Parse `div.day` count dynamically.

### City vs district links in `div.c`

- **Film mode address**: `<a href="/programm?stadt=Tübingen">Tübingen</a>` — bare `?stadt=` → city name
- **City mode address**: `<a href="/programm?stadt=Berlin&bezirk=Mitte">Mitte</a>` — has `&bezirk=` → district, NOT city
- Detect city link: href contains `?stadt=` but NOT `&bezirk=` and NOT `&kino=`

### `h2` structure differs between city and film mode

- City mode: `<h2><a href="...">Film Title</a> (Format)</h2>` — film is in `<a>`, format is suffix text
- Film mode: `<h2>Film Title</h2>` — no `<a>`, no format suffix (it's the searched film)

### `div.c` address uses `•` (U+2022) as street/district separator

`"Sterndamm 69 • Treptow-Köpenick"` — split on `•` to isolate street address.

### `ticketUrl` values are usually absolute external URLs

e.g. `https://kinotickets.express/...` — no prepending needed. But internal relative URLs
(`/kino/...`) should get `https://allekinos.de` prepended (handled in scraper).

## City Matching (`src/cities.ts`)

### City list comes from `a.city` on the homepage

`GET https://allekinos.de/` → parse `a.city` elements. Cached at `~/.allekinos/cache/cities.json`
with a 30-day TTL. If the homepage changes structure and yields 0 cities, a warning is printed to
stderr — `resolveCity` will then throw `UnknownCityError` for any input.

### Use `resolveCityFromList(query, cities)` for tests (not `resolveCity`)

`resolveCity` calls `getCities()` which makes a network request. For unit tests, call the pure
function `resolveCityFromList(query, cities)` with a hardcoded city list to avoid mocking.

### Levenshtein threshold is scaled by query length

Queries ≤4 characters use `maxDist = 1`; longer queries use `maxDist = 2`. This prevents short
city names like `"Ulm"` from fuzzy-matching unrelated cities.

## Bundling for npm (Node compatibility)

### Never use `import.meta.main` in code that gets bundled

Bun's bundler rewrites `import.meta.main` to `__require.main === __require.module` which crashes
in ESM under Node. Solution: separate `src/cli.ts` (entry point, calls `main()`) from
`src/index.ts` (exports `main()` + other functions for tests). Build entry is `src/cli.ts`.

### Bun-specific APIs break under Node

`Bun.file()`, `Bun.write()` don't exist in Node. Use `fs.readFileSync` / `fs.writeFileSync`.

### OV filter checks `format` field as substring

`isOV` checks whether `format.toLowerCase()` includes `"ov"`, `"omu"`, or `"omeu"`.
Formats like `"OV"`, `"OmU"`, `"OmeU"`, `"3D, OV"` all match correctly.
