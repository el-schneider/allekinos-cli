import { describe, it, expect } from "bun:test";
import { formatScreenings, formatDateDE } from "./format.ts";
import type { Screening } from "./types.ts";

// ── Test factory ──────────────────────────────────────────────────────────────

function makeScreening(overrides: Partial<Screening> = {}): Screening {
  return {
    film: "Test Film",
    format: undefined,
    genres: ["Drama"],
    year: 2025,
    runtime: "1 Std. 30 Min.",
    fsk: "FSK 12",
    description: "",
    cinema: "Kino A",
    address: "Musterstraße 1",
    city: "Berlin",
    date: "2026-03-15",
    time: "20:00",
    isPast: false,
    ticketUrl: undefined,
    ...overrides,
  };
}

// ── formatDateDE ──────────────────────────────────────────────────────────────

describe("formatDateDE", () => {
  it('formats "2026-03-15" → "So. 15. März" (UTC-safe, not Sat)', () => {
    expect(formatDateDE("2026-03-15")).toBe("So. 15. März");
  });

  it('formats "2026-01-01" → "Do. 1. Jan."', () => {
    expect(formatDateDE("2026-01-01")).toBe("Do. 1. Jan.");
  });

  it('formats "2026-12-25" correctly', () => {
    // 2026-12-25 is a Friday
    expect(formatDateDE("2026-12-25")).toBe("Fr. 25. Dez.");
  });

  it('formats "2026-06-01" using "Juni" (no dot)', () => {
    expect(formatDateDE("2026-06-01")).toBe("Mo. 1. Juni");
  });
});

// ── city-today mode ───────────────────────────────────────────────────────────

describe("formatScreenings — city-today", () => {
  const screenings: Screening[] = [
    makeScreening({ cinema: "Kino A", address: "Straße 1", film: "Film X", time: "17:30" }),
    makeScreening({ cinema: "Kino A", address: "Straße 1", film: "Film X", time: "20:00" }),
    makeScreening({
      cinema: "Kino A",
      address: "Straße 1",
      film: "Film Y",
      format: "OmU",
      time: "18:00",
    }),
    makeScreening({ cinema: "Kino B", address: "Allee 5", film: "Film Z", time: "19:00" }),
  ];

  it("contains cinema names as headers", () => {
    const out = formatScreenings(screenings, "city-today", false);
    expect(out).toContain("Kino A");
    expect(out).toContain("Kino B");
  });

  it("contains film titles indented", () => {
    const out = formatScreenings(screenings, "city-today", false);
    expect(out).toMatch(/^\s+Film X/m);
    expect(out).toMatch(/^\s+Film Y/m);
    expect(out).toMatch(/^\s+Film Z/m);
  });

  it("shows times on the same line as film", () => {
    const out = formatScreenings(screenings, "city-today", false);
    // Film X should have both times on the same line
    expect(out).toMatch(/Film X.*17:30.*20:00/);
  });

  it("shows format tag in parentheses", () => {
    const out = formatScreenings(screenings, "city-today", false);
    expect(out).toContain("Film Y (OmU)");
  });

  it("contains address after cinema", () => {
    const out = formatScreenings(screenings, "city-today", false);
    expect(out).toContain("Straße 1");
  });

  it("does NOT contain ANSI codes when useColor=false", () => {
    const out = formatScreenings(screenings, "city-today", false);
    expect(out).not.toContain("\x1b");
  });

  it("deduplicates times for same film at same cinema", () => {
    const dupes: Screening[] = [
      makeScreening({ cinema: "Kino A", film: "Film X", time: "17:30" }),
      makeScreening({ cinema: "Kino A", film: "Film X", time: "17:30" }), // same time, diff ticketUrl
    ];
    const out = formatScreenings(dupes, "city-today", false);
    // "17:30" should appear exactly once
    const matches = out.match(/17:30/g);
    expect(matches?.length).toBe(1);
  });
});

// ── city-week mode ────────────────────────────────────────────────────────────

describe("formatScreenings — city-week", () => {
  const screenings: Screening[] = [
    makeScreening({
      date: "2026-03-15",
      cinema: "Kino A",
      address: "Straße 1",
      film: "Film X",
      time: "20:00",
    }),
    makeScreening({
      date: "2026-03-15",
      cinema: "Kino B",
      address: "Allee 5",
      film: "Film Y",
      time: "18:00",
    }),
    makeScreening({
      date: "2026-03-16",
      cinema: "Kino A",
      address: "Straße 1",
      film: "Film Z",
      time: "19:00",
    }),
  ];

  it("contains German date headers", () => {
    const out = formatScreenings(screenings, "city-week", false);
    expect(out).toContain("So. 15. März");
    expect(out).toContain("Mo. 16. März");
  });

  it("shows dates in chronological order", () => {
    const out = formatScreenings(screenings, "city-week", false);
    const idx15 = out.indexOf("15. März");
    const idx16 = out.indexOf("16. März");
    expect(idx15).toBeLessThan(idx16);
  });

  it("shows cinema names indented under date", () => {
    const out = formatScreenings(screenings, "city-week", false);
    expect(out).toMatch(/^\s{2}Kino A/m);
    expect(out).toMatch(/^\s{2}Kino B/m);
  });

  it("shows films indented under cinemas", () => {
    const out = formatScreenings(screenings, "city-week", false);
    expect(out).toMatch(/^\s{4}Film X/m);
    expect(out).toMatch(/^\s{4}Film Y/m);
  });

  it("does NOT contain ANSI codes when useColor=false", () => {
    const out = formatScreenings(screenings, "city-week", false);
    expect(out).not.toContain("\x1b");
  });
});

// ── film mode ─────────────────────────────────────────────────────────────────

describe("formatScreenings — film mode", () => {
  const screenings: Screening[] = [
    makeScreening({ city: "Berlin", cinema: "Kino A", film: "Dune", time: "18:00" }),
    makeScreening({ city: "Berlin", cinema: "Kino A", film: "Dune", time: "21:00" }),
    makeScreening({ city: "München", cinema: "Kino B", film: "Dune", time: "20:00" }),
  ];

  it("shows city names as headers", () => {
    const out = formatScreenings(screenings, "film", false);
    expect(out).toContain("Berlin");
    expect(out).toContain("München");
  });

  it("shows cinema names indented under city", () => {
    const out = formatScreenings(screenings, "film", false);
    expect(out).toMatch(/^\s{2}Kino A/m);
    expect(out).toMatch(/^\s{2}Kino B/m);
  });

  it("shows times on the same line as cinema", () => {
    const out = formatScreenings(screenings, "film", false);
    // Kino A should show both times
    expect(out).toMatch(/Kino A.*18:00.*21:00/);
  });

  it("does NOT show the film title (it's the searched film)", () => {
    const out = formatScreenings(screenings, "film", false);
    // "Dune" should not appear as content (though city/cinema names might coincidentally match)
    expect(out).not.toContain("Dune");
  });

  it("does NOT contain ANSI codes when useColor=false", () => {
    const out = formatScreenings(screenings, "film", false);
    expect(out).not.toContain("\x1b");
  });
});

// ── color output ──────────────────────────────────────────────────────────────

describe("formatScreenings — color output", () => {
  const screenings: Screening[] = [
    makeScreening({
      cinema: "Kino A",
      address: "Straße 1",
      film: "Film X",
      format: "OV",
      time: "20:00",
    }),
  ];

  it("wraps cinema name in bold ANSI when useColor=true", () => {
    const out = formatScreenings(screenings, "city-today", true);
    expect(out).toContain("\x1b[1mKino A\x1b[0m");
  });

  it("wraps format tag in green ANSI when useColor=true", () => {
    const out = formatScreenings(screenings, "city-today", true);
    expect(out).toContain("\x1b[32mOV\x1b[0m");
  });

  it("wraps address in dim ANSI when useColor=true", () => {
    const out = formatScreenings(screenings, "city-today", true);
    expect(out).toContain("\x1b[2mStraße 1\x1b[0m");
  });

  it("contains ANSI codes in city-week date header when useColor=true", () => {
    const out = formatScreenings(
      [makeScreening({ date: "2026-03-15", cinema: "Kino A", film: "Film X", time: "20:00" })],
      "city-week",
      true,
    );
    expect(out).toContain("\x1b[1mSo. 15. März\x1b[0m");
  });
});

// ── empty screenings ──────────────────────────────────────────────────────────

describe("formatScreenings — empty input", () => {
  it("returns empty string for city-today", () => {
    expect(formatScreenings([], "city-today", false)).toBe("");
  });

  it("returns empty string for city-week", () => {
    expect(formatScreenings([], "city-week", false)).toBe("");
  });

  it("returns empty string for film mode", () => {
    expect(formatScreenings([], "film", false)).toBe("");
  });
});
