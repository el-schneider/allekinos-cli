import { describe, it, expect } from "bun:test";
import {
  normalizeUmlauts,
  resolveCityFromList,
  AmbiguousCityError,
  UnknownCityError,
} from "./cities.ts";

const TEST_CITIES = ["Berlin", "Tübingen", "München", "Münster", "Frankfurt am Main", "Freiburg"];

// ── normalizeUmlauts ───────────────────────────────────────────────────────────

describe("normalizeUmlauts", () => {
  it("normalizes ü, ö, ä, ß and leaves ASCII unchanged", () => {
    expect(normalizeUmlauts("Tübingen")).toBe("Tubingen");
    expect(normalizeUmlauts("Göttingen")).toBe("Gottingen");
    expect(normalizeUmlauts("Straße")).toBe("Strasse");
    expect(normalizeUmlauts("Berlin")).toBe("Berlin");
  });
});

// ── resolveCityFromList ────────────────────────────────────────────────────────

describe("resolveCityFromList", () => {
  it("case-insensitive exact match", () => {
    expect(resolveCityFromList("berlin", TEST_CITIES)).toBe("Berlin");
    expect(resolveCityFromList("MÜNCHEN", TEST_CITIES)).toBe("München");
  });

  it("umlaut normalization: tubingen → Tübingen", () => {
    expect(resolveCityFromList("tubingen", TEST_CITIES)).toBe("Tübingen");
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
});

// ── Levenshtein threshold scaling ─────────────────────────────────────────────

describe("Levenshtein threshold scaling", () => {
  it("short query (<=4 chars) uses maxDist=1: accepts distance-1 fuzzy match", () => {
    expect(resolveCityFromList("Bonm", ["Bonn"])).toBe("Bonn");
  });

  it("short query (<=4 chars) uses maxDist=1: rejects distance-2 fuzzy match", () => {
    expect(() => resolveCityFromList("Ache", ["Aachen"])).toThrow(UnknownCityError);
  });

  it("long query (>4 chars) uses maxDist=2: accepts distance-2 fuzzy match", () => {
    expect(resolveCityFromList("Aacheenn", ["Aachen"])).toBe("Aachen");
  });
});
