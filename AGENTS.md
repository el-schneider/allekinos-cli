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
