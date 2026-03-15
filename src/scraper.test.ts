import { describe, it, expect } from "bun:test";
import { parse as parseHTML } from "node-html-parser";
import { parseDayHeaders, parseMetadataText, parsePage } from "./scraper.ts";

const CURRENT_YEAR = new Date().getFullYear();
const JANUARY_YEAR = new Date().getMonth() === 11 ? CURRENT_YEAR + 1 : CURRENT_YEAR;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePageHtml(dayHeaders: string[], rowsHtml: string): string {
  return `
<html><body><div class="program"><div class="movies">
  ${dayHeaders.map((d) => `<div class="day">${d}</div>`).join("")}
  ${rowsHtml}
</div></div></body></html>`;
}

function makeCinemaBlock(
  cinemaName: string,
  address: string,
  cityHref: string | null,
  slots: Array<{ isPast: boolean; time: string; url?: string }[]>,
): string {
  const cityLink = cityHref
    ? `<a href="/programm?stadt=${cityHref}">${cityHref}</a>`
    : `<a href="/programm?stadt=Berlin&amp;bezirk=Mitte">Mitte</a>`;

  const cinemaHtml =
    `<div class="c">
    <a href="/programm?stadt=Berlin&amp;kino=Test">` +
    cinemaName +
    `</a>
    <div>${address} • ${cityLink}</div>
  </div>`;

  const pEls = slots
    .map((daySlots) => {
      const inner = daySlots
        .map((s) => {
          if (s.isPast) return `<span class="past">${s.time}</span>`;
          return `<a href="${s.url ?? "https://ticket.example.com/1"}" target="_blank">${s.time}</a>`;
        })
        .join("");
      return `<p>${inner}</p>`;
    })
    .join("");

  return cinemaHtml + pEls;
}

function makeRowHtml(
  film: string,
  format: string | null,
  mi: string,
  description: string,
  cinemasHtml: string,
  dayCount: number,
): string {
  const formatSuffix = format ? ` (${format})` : "";
  const filmLink = `<a href="/programm?film=${film}">${film}</a>`;
  return `
<div class="row">
  <div class="mt">
    <h2>${filmLink}${formatSuffix}</h2>
    <div class="mi">${mi}</div>
    <div class="md" title="${description}">truncated…</div>
  </div>
  <p class="e" style="grid-column-end:span ${dayCount - 1};"></p>
  ${cinemasHtml}
</div>`;
}

// ── parseDayHeaders ────────────────────────────────────────────────────────────

describe("parseDayHeaders", () => {
  it("parses 8 standard German day headers", () => {
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      "",
    );
    const root = parseHTML(html);
    const dates = parseDayHeaders(root);
    expect(dates).toHaveLength(8);
    expect(dates[0]).toBe(`${CURRENT_YEAR}-03-15`);
    expect(dates[7]).toBe(`${CURRENT_YEAR}-03-22`);
  });

  it("parses 4 day headers (film mode)", () => {
    const html = makePageHtml(["So. 15. März", "Mo. 16. März", "Di. 17. März", "Mi. 18. März"], "");
    const root = parseHTML(html);
    const dates = parseDayHeaders(root);
    expect(dates).toHaveLength(4);
    expect(dates[3]).toBe(`${CURRENT_YEAR}-03-18`);
  });

  it("handles Dec→Jan year rollover", () => {
    const html = makePageHtml(["Mo. 5. Januar", "Di. 6. Januar"], "");
    const root = parseHTML(html);
    const dates = parseDayHeaders(root);
    expect(dates[0]).toBe(`${JANUARY_YEAR}-01-05`);
    expect(dates[1]).toBe(`${JANUARY_YEAR}-01-06`);
  });

  it("parses all German month names", () => {
    const months: [string, string][] = [
      ["Januar", "01"],
      ["Februar", "02"],
      ["März", "03"],
      ["April", "04"],
      ["Mai", "05"],
      ["Juni", "06"],
      ["Juli", "07"],
      ["August", "08"],
      ["September", "09"],
      ["Oktober", "10"],
      ["November", "11"],
      ["Dezember", "12"],
    ];
    for (const [name, mm] of months) {
      const html = makePageHtml([`Mo. 1. ${name}`], "");
      const root = parseHTML(html);
      const dates = parseDayHeaders(root);
      expect(dates[0]).toMatch(new RegExp(`^\\d{4}-${mm}-01$`));
    }
  });
});

// ── parseMetadataText ──────────────────────────────────────────────────────────

describe("parseMetadataText", () => {
  it("parses full metadata with bullet separator U+2022", () => {
    const result = parseMetadataText(
      "Drama, Thriller \u2022 2016 \u2022 1 Std. 56 Min. \u2022 FSK 12",
    );
    expect(result.genres).toEqual(["Drama", "Thriller"]);
    expect(result.year).toBe(2016);
    expect(result.runtime).toBe("1 Std. 56 Min.");
    expect(result.fsk).toBe("FSK 12");
  });

  it("parses full metadata with middle dot separator U+00B7", () => {
    const result = parseMetadataText(
      "Drama, Thriller \u00B7 2016 \u00B7 1 Std. 56 Min. \u00B7 FSK 12",
    );
    expect(result.genres).toEqual(["Drama", "Thriller"]);
    expect(result.year).toBe(2016);
    expect(result.runtime).toBe("1 Std. 56 Min.");
    expect(result.fsk).toBe("FSK 12");
  });

  it("parses metadata without FSK", () => {
    const result = parseMetadataText("Animation \u2022 2024 \u2022 1 Std. 30 Min.");
    expect(result.genres).toEqual(["Animation"]);
    expect(result.year).toBe(2024);
    expect(result.runtime).toBe("1 Std. 30 Min.");
    expect(result.fsk).toBeUndefined();
  });

  it("parses only genres when no year/runtime/fsk", () => {
    const result = parseMetadataText("Dokumentarfilm");
    expect(result.genres).toEqual(["Dokumentarfilm"]);
    expect(result.year).toBeUndefined();
    expect(result.runtime).toBeUndefined();
    expect(result.fsk).toBeUndefined();
  });

  it("parses FSK with various formats", () => {
    expect(parseMetadataText("FSK 6").fsk).toBe("FSK 6");
    expect(parseMetadataText("FSK 12").fsk).toBe("FSK 12");
    expect(parseMetadataText("FSK ab 16").fsk).toBe("FSK ab 16");
    expect(parseMetadataText("FSK 0").fsk).toBe("FSK 0");
  });

  it("parses runtime with only minutes", () => {
    const result = parseMetadataText("Kurzfilm \u2022 2023 \u2022 45 Min.");
    expect(result.runtime).toBe("45 Min.");
  });
});

// ── parsePage — format extraction ─────────────────────────────────────────────

describe("parsePage format extraction", () => {
  it("extracts OV format suffix from h2", () => {
    const cinema = makeCinemaBlock("Kino", "Hauptstrasse 1", null, [
      [{ isPast: false, time: "19:30", url: "https://ticket.example.com/1" }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      makeRowHtml("Arrival", "OV", "Sci-Fi \u2022 2016", "A movie", cinema, 8),
    );
    const screenings = parsePage(html);
    expect(screenings.length).toBeGreaterThan(0);
    expect(screenings[0].film).toBe("Arrival");
    expect(screenings[0].format).toBe("OV");
  });

  it("extracts compound format suffix", () => {
    const cinema = makeCinemaBlock("Kino", "Hauptstrasse 1", null, [
      [{ isPast: false, time: "20:00", url: "https://ticket.example.com/1" }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      makeRowHtml("Hoppers", "3D, IMAX", "Animation \u2022 2026", "A movie", cinema, 8),
    );
    const screenings = parsePage(html);
    expect(screenings[0].format).toBe("3D, IMAX");
  });

  it("leaves format undefined when no suffix", () => {
    const cinema = makeCinemaBlock("Kino", "Hauptstrasse 1", null, [
      [{ isPast: false, time: "20:00", url: "https://ticket.example.com/1" }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      makeRowHtml("Hoppers", null, "Animation \u2022 2026", "A movie", cinema, 8),
    );
    const screenings = parsePage(html);
    expect(screenings[0].format).toBeUndefined();
  });
});

// ── parsePage — full page parse ────────────────────────────────────────────────

describe("parsePage full parse", () => {
  it("parses a minimal page with one screening", () => {
    const cinema = makeCinemaBlock("Filmpalast", "Hauptstr. 1", null, [
      [{ isPast: false, time: "19:30", url: "https://ticket.example.com/42" }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      makeRowHtml(
        "Inception",
        null,
        "Sci-Fi \u2022 2010 \u2022 2 Std. 28 Min. \u2022 FSK 12",
        "Great film",
        cinema,
        8,
      ),
    );
    const screenings = parsePage(html);
    expect(screenings).toHaveLength(1);
    const s = screenings[0];
    expect(s.film).toBe("Inception");
    expect(s.cinema).toBe("Filmpalast");
    expect(s.address).toBe("Hauptstr. 1");
    expect(s.date).toBe(`${CURRENT_YEAR}-03-15`);
    expect(s.time).toBe("19:30");
    expect(s.isPast).toBe(false);
    expect(s.ticketUrl).toBe("https://ticket.example.com/42");
    expect(s.genres).toEqual(["Sci-Fi"]);
    expect(s.year).toBe(2010);
    expect(s.runtime).toBe("2 Std. 28 Min.");
    expect(s.fsk).toBe("FSK 12");
    expect(s.description).toBe("Great film");
  });

  it("parses past screenings correctly", () => {
    const cinema = makeCinemaBlock("Kino", "Str. 1", null, [
      [
        { isPast: true, time: "10:00" },
        { isPast: true, time: "13:00" },
      ],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      makeRowHtml("Oldfilm", null, "Drama", "Old", cinema, 8),
    );
    const screenings = parsePage(html);
    expect(screenings).toHaveLength(2);
    expect(screenings[0].isPast).toBe(true);
    expect(screenings[0].time).toBe("10:00");
    expect(screenings[0].ticketUrl).toBeUndefined();
    expect(screenings[1].isPast).toBe(true);
    expect(screenings[1].time).toBe("13:00");
  });

  it("falls back to div.md text when title attribute is empty", () => {
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      `<div class="row">
        <div class="mt">
          <h2><a href="/programm?film=Testfilm">Testfilm</a></h2>
          <div class="mi">Drama</div>
          <div class="md" title="">Fallback description</div>
        </div>
        <p class="e"></p>
        <div class="c">
          <a href="/programm?stadt=Berlin&amp;kino=Test">Test Kino</a>
          <div>Teststr. 5 • <a href="/programm?stadt=Berlin&amp;bezirk=Mitte">Mitte</a></div>
        </div>
        <p><a href="https://ticket.example.com/1">20:00</a></p>
      </div>`,
    );

    const screenings = parsePage(html);
    expect(screenings).toHaveLength(1);
    expect(screenings[0].description).toBe("Fallback description");
  });

  it("parses address when separator is middle dot", () => {
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      `<div class="row">
        <div class="mt">
          <h2><a href="/programm?film=Testfilm">Testfilm</a></h2>
          <div class="mi">Drama</div>
          <div class="md" title="Desc">Desc</div>
        </div>
        <p class="e"></p>
        <div class="c">
          <a href="/programm?stadt=Berlin&amp;kino=Test">Test Kino</a>
          <div>Teststr. 5 · <a href="/programm?stadt=Berlin&amp;bezirk=Mitte">Mitte</a></div>
        </div>
        <p><a href="https://ticket.example.com/1">20:00</a></p>
      </div>`,
    );

    const screenings = parsePage(html);
    expect(screenings).toHaveLength(1);
    expect(screenings[0].address).toBe("Teststr. 5");
  });
});

// ── Integration: city vs film mode ────────────────────────────────────────────

describe("city mode vs film mode", () => {
  it("city mode: city field is undefined when no city link in address", () => {
    const cinemaHtml =
      `<div class="c">
      <a href="/programm?stadt=Berlin&amp;kino=Test">Test Kino</a>
      <div>Teststr. 5 \u2022 <a href="/programm?stadt=Berlin&amp;bezirk=Mitte">Mitte</a></div>
    </div>` +
      Array.from({ length: 8 }, (_, i) =>
        i === 2
          ? `<p><a href="https://ticket.example.com/1" target="_blank">20:00</a></p>`
          : `<p></p>`,
      ).join("");

    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      `<div class="row">
        <div class="mt">
          <h2><a href="/programm?film=Testfilm">Testfilm</a></h2>
          <div class="mi">Drama</div>
          <div class="md" title="desc">desc</div>
        </div>
        <p class="e"></p>
        ${cinemaHtml}
      </div>`,
    );
    const screenings = parsePage(html);
    expect(screenings.length).toBeGreaterThan(0);
    expect(screenings[0].city).toBeUndefined();
  });

  it("film mode: city is extracted from bare city link in address", () => {
    const cinemaHtml =
      `<div class="c">
      <a href="/programm?stadt=T%C3%BCbingen&amp;kino=Blaue+Bruecke">Filmtheater Blaue Brücke</a>
      <div>Friedrichstrasse 19 \u2022 <a href="/programm?stadt=T%C3%BCbingen">Tübingen</a></div>
    </div>` +
      Array.from({ length: 4 }, (_, i) =>
        i === 3
          ? `<p><a href="https://ticket.example.com/77264" target="_blank">14:00</a></p>`
          : `<p></p>`,
      ).join("");

    const html = makePageHtml(
      ["So. 15. März", "Mo. 16. März", "Di. 17. März", "Mi. 18. März"],
      `<div class="row">
        <div class="mt">
          <h2>Arrival</h2>
          <div class="mi">Sci-Fi \u2022 2016 \u2022 1 Std. 56 Min. \u2022 FSK 12</div>
          <div class="md" title="Aliens land.">Aliens land.</div>
        </div>
        <p class="e"></p>
        ${cinemaHtml}
      </div>`,
    );
    const screenings = parsePage(html);
    expect(screenings).toHaveLength(1);
    expect(screenings[0].city).toBe("Tübingen");
    expect(screenings[0].cinema).toBe("Filmtheater Blaue Brücke");
    expect(screenings[0].address).toBe("Friedrichstrasse 19");
    expect(screenings[0].date).toBe(`${CURRENT_YEAR}-03-18`);
    expect(screenings[0].time).toBe("14:00");
  });

  it("multiple times in one day cell → separate Screening objects", () => {
    const cinema = makeCinemaBlock("Multiplex", "Ringstr. 10", null, [
      [
        { isPast: false, time: "14:00", url: "https://ticket.example.com/1" },
        { isPast: false, time: "17:30", url: "https://ticket.example.com/2" },
        { isPast: false, time: "20:15", url: "https://ticket.example.com/3" },
      ],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      makeRowHtml("Blockbuster", null, "Action \u2022 2025", "Boom", cinema, 8),
    );
    const screenings = parsePage(html);
    expect(screenings).toHaveLength(3);
    expect(screenings.map((s) => s.time)).toEqual(["14:00", "17:30", "20:15"]);
    expect(new Set(screenings.map((s) => s.date)).size).toBe(1);
    expect(screenings[0].date).toBe(`${CURRENT_YEAR}-03-15`);
  });

  it("multiple cinemas per row → correct count", () => {
    const cinema1 = makeCinemaBlock("Kino A", "Str. 1", null, [
      [{ isPast: false, time: "19:00", url: "https://t.example.com/1" }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const cinema2 = makeCinemaBlock("Kino B", "Str. 2", null, [
      [],
      [{ isPast: false, time: "20:00", url: "https://t.example.com/2" }],
      [],
      [],
      [],
      [],
      [],
      [],
    ]);
    const html = makePageHtml(
      [
        "So. 15. März",
        "Mo. 16. März",
        "Di. 17. März",
        "Mi. 18. März",
        "Do. 19. März",
        "Fr. 20. März",
        "Sa. 21. März",
        "So. 22. März",
      ],
      makeRowHtml("MultiCinema", null, "Drama", "desc", cinema1 + cinema2, 8),
    );
    const screenings = parsePage(html);
    expect(screenings).toHaveLength(2);
    expect(screenings[0].cinema).toBe("Kino A");
    expect(screenings[0].date).toBe(`${CURRENT_YEAR}-03-15`);
    expect(screenings[1].cinema).toBe("Kino B");
    expect(screenings[1].date).toBe(`${CURRENT_YEAR}-03-16`);
  });
});
