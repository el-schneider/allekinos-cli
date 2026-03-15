import { describe, it, expect } from "bun:test";
import { parseArgs, CliUsageError } from "./index.ts";

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("parses a bare city positional argument", () => {
    const opts = parseArgs(["Berlin"]);
    expect(opts.city).toBe("Berlin");
    expect(opts.film).toBeUndefined();
    expect(opts.ov).toBe(false);
    expect(opts.json).toBe(false);
    expect(opts.today).toBe(false);
  });

  it("parses --film <name>", () => {
    const opts = parseArgs(["--film", "Dune"]);
    expect(opts.film).toBe("Dune");
    expect(opts.city).toBeUndefined();
  });

  it("parses --genre <name>", () => {
    const opts = parseArgs(["Berlin", "--genre", "Drama"]);
    expect(opts.genre).toBe("Drama");
  });

  it("parses --ov, --today, --json boolean flags", () => {
    const opts = parseArgs(["Berlin", "--ov", "--today", "--json"]);
    expect(opts.ov).toBe(true);
    expect(opts.today).toBe(true);
    expect(opts.json).toBe(true);
  });

  // ── --film missing value ───────────────────────────────────────────────────

  it("throws CliUsageError when --film has no following argument", () => {
    expect(() => parseArgs(["--film"])).toThrow(CliUsageError);
  });

  it("throws CliUsageError when --film value is another flag", () => {
    expect(() => parseArgs(["--film", "--ov"])).toThrow(CliUsageError);
  });

  // ── --genre missing value ──────────────────────────────────────────────────

  it("throws CliUsageError when --genre has no following argument", () => {
    expect(() => parseArgs(["Berlin", "--genre"])).toThrow(CliUsageError);
  });

  it("throws CliUsageError when --genre value is another flag", () => {
    expect(() => parseArgs(["Berlin", "--genre", "--ov"])).toThrow(CliUsageError);
  });

  // ── unknown flags ──────────────────────────────────────────────────────────

  it("throws CliUsageError for an unknown long flag", () => {
    expect(() => parseArgs(["Berlin", "--unknown"])).toThrow(CliUsageError);
  });

  it("throws CliUsageError for an unknown short flag", () => {
    expect(() => parseArgs(["Berlin", "-z"])).toThrow(CliUsageError);
  });

  // ── extra positional args ──────────────────────────────────────────────────

  it("throws CliUsageError for extra positional arg and message mentions quoting", () => {
    let error: unknown;
    try {
      parseArgs(["Frankfurt", "am", "Main"]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CliUsageError);
    // Message should hint that the user should quote multi-word city names
    expect((error as CliUsageError).message).toMatch(/quot/i);
  });

  it("throws CliUsageError for a single extra positional after city", () => {
    expect(() => parseArgs(["Berlin", "extra"])).toThrow(CliUsageError);
  });

  // ── city + --film combination ─────────────────────────────────────────────

  it("allows city positional and --film together", () => {
    const opts = parseArgs(["Berlin", "--film", "Dune"]);
    expect(opts.city).toBe("Berlin");
    expect(opts.film).toBe("Dune");
  });

  // ── --week flag ────────────────────────────────────────────────────────────

  it("parses --week flag", () => {
    const opts = parseArgs(["Berlin", "--week"]);
    expect(opts.week).toBe(true);
  });

  it("throws CliUsageError when --week and --today are both set", () => {
    let error: unknown;
    try {
      parseArgs(["Berlin", "--week", "--today"]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CliUsageError);
    expect((error as CliUsageError).message).toMatch(/mutually exclusive/i);
  });
});
