import { describe, it, expect } from "bun:test";
import {
  normalizeUmlauts,
  levenshtein,
  resolveCityFromList,
  AmbiguousCityError,
  UnknownCityError,
} from "./cities.ts";

const TEST_CITIES = ["Berlin", "Tübingen", "München", "Münster", "Frankfurt am Main", "Freiburg"];

// ── normalizeUmlauts ───────────────────────────────────────────────────────────

describe("normalizeUmlauts", () => {
  it("normalizes ü, ö, ä (lowercase)", () => {
    expect(normalizeUmlauts("Tübingen")).toBe("Tubingen");
    expect(normalizeUmlauts("Göttingen")).toBe("Gottingen");
    expect(normalizeUmlauts("München")).toBe("Munchen");
  });

  it("normalizes ß to ss", () => {
    expect(normalizeUmlauts("Straße")).toBe("Strasse");
  });

  it("normalizes Ü, Ö, Ä (uppercase)", () => {
    expect(normalizeUmlauts("ÜBER")).toBe("UBER");
    expect(normalizeUmlauts("ÖFFNUNG")).toBe("OFFNUNG");
    expect(normalizeUmlauts("ÄRGER")).toBe("ARGER");
  });

  it("leaves ASCII strings unchanged", () => {
    expect(normalizeUmlauts("Berlin")).toBe("Berlin");
    expect(normalizeUmlauts("Frankfurt am Main")).toBe("Frankfurt am Main");
  });
});

// ── levenshtein ────────────────────────────────────────────────────────────────

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("Berlin", "Berlin")).toBe(0);
    expect(levenshtein("", "")).toBe(0);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("returns 1 for single deletion", () => {
    expect(levenshtein("Berlin", "Berln")).toBe(1);
  });

  it("returns 1 for single insertion", () => {
    expect(levenshtein("Berlin", "Berlinn")).toBe(1);
  });

  it("returns 1 for single substitution", () => {
    expect(levenshtein("Berlin", "Barlin")).toBe(1);
  });
});

// ── resolveCityFromList ────────────────────────────────────────────────────────

describe("resolveCityFromList", () => {
  it("exact match", () => {
    expect(resolveCityFromList("Berlin", TEST_CITIES)).toBe("Berlin");
  });

  it("case-insensitive exact match", () => {
    expect(resolveCityFromList("berlin", TEST_CITIES)).toBe("Berlin");
    expect(resolveCityFromList("MÜNCHEN", TEST_CITIES)).toBe("München");
  });

  it("umlaut normalization: tubingen → Tübingen", () => {
    expect(resolveCityFromList("tubingen", TEST_CITIES)).toBe("Tübingen");
  });

  it("umlaut normalization: munchen → München", () => {
    expect(resolveCityFromList("munchen", TEST_CITIES)).toBe("München");
  });

  it("prefix match: Frei → Freiburg (unique prefix)", () => {
    expect(resolveCityFromList("Frei", TEST_CITIES)).toBe("Freiburg");
  });

  it("prefix match: Mün is ambiguous → throws AmbiguousCityError", () => {
    let threw = false;
    try {
      resolveCityFromList("Mün", TEST_CITIES);
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(AmbiguousCityError);
      const err = e as AmbiguousCityError;
      expect(err.candidates).toContain("München");
      expect(err.candidates).toContain("Münster");
    }
    expect(threw).toBe(true);
  });

  it("unknown city → throws UnknownCityError", () => {
    let threw = false;
    try {
      resolveCityFromList("Atlantis", TEST_CITIES);
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(UnknownCityError);
      const err = e as UnknownCityError;
      expect(err.query).toBe("Atlantis");
    }
    expect(threw).toBe(true);
  });

  it("levenshtein match: Berln → Berlin (distance 1)", () => {
    expect(resolveCityFromList("Berln", TEST_CITIES)).toBe("Berlin");
  });

  it("trims leading/trailing whitespace before matching", () => {
    expect(resolveCityFromList("  Berlin  ", TEST_CITIES)).toBe("Berlin");
    expect(resolveCityFromList("\tMünchen\n", TEST_CITIES)).toBe("München");
  });

  it("empty string throws UnknownCityError", () => {
    expect(() => resolveCityFromList("", TEST_CITIES)).toThrow(UnknownCityError);
  });

  it("whitespace-only string throws UnknownCityError", () => {
    expect(() => resolveCityFromList("   ", TEST_CITIES)).toThrow(UnknownCityError);
  });
});

// ── Levenshtein threshold scaling ─────────────────────────────────────────────

describe("Levenshtein threshold scaling", () => {
  it("short query (<=4 chars) uses maxDist=1: accepts distance-1 fuzzy match", () => {
    // "Bonm" is not a prefix of "Bonn" but levenshtein("bonm","bonn") = 1
    expect(resolveCityFromList("Bonm", ["Bonn"])).toBe("Bonn");
  });

  it("short query (<=4 chars) uses maxDist=1: rejects distance-2 fuzzy match", () => {
    // levenshtein("ache","aachen") = 2 — exceeds maxDist=1 for a 4-char query
    expect(() => resolveCityFromList("Ache", ["Aachen"])).toThrow(UnknownCityError);
  });

  it("long query (>4 chars) uses maxDist=2: accepts distance-2 fuzzy match", () => {
    // levenshtein("aacheenn","aachen") = 2 — within maxDist=2 for an 8-char query
    expect(resolveCityFromList("Aacheenn", ["Aachen"])).toBe("Aachen");
  });
});
