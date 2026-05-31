import { describe, it, expect } from "vitest";
import { parseArgs } from "./args";

describe("parseArgs", () => {
  it("parses a result run with sensible defaults", () => {
    const o = parseArgs(["--model", "google/nano-banana-edit", "--prompt", "make figure", "--source", "puppy", "--slug", "afg", "--mode", "result", "--count", "4", "--size", "800x1200"]);
    expect(o).toMatchObject({
      model: "google/nano-banana-edit",
      mode: "result",
      count: 4,
      size: "800x1200",
      start: 1,
      orientation: "portrait",
      out: "output/image-edit/afg",
      noAi: false,
    });
  });

  it("defaults compare size to 1200x800 and orientation to portrait", () => {
    const o = parseArgs(["--model", "google/nano-banana-edit", "--prompt", "p", "--source", "dog", "--slug", "afg", "--mode", "compare"]);
    expect(o.size).toBe("1200x800");
    expect(o.orientation).toBe("portrait");
  });

  it("requires --model (no silent default)", () => {
    expect(() => parseArgs(["--prompt", "p", "--source", "x", "--slug", "afg"])).toThrow(/model/);
  });

  it("requires slug and source", () => {
    expect(() => parseArgs(["--prompt", "p", "--source", "x"])).toThrow(/slug/);
    expect(() => parseArgs(["--prompt", "p", "--slug", "afg"])).toThrow(/source/);
  });

  it("requires prompt unless --no-ai", () => {
    expect(() => parseArgs(["--source", "x", "--slug", "afg"])).toThrow(/prompt/);
    const o = parseArgs(["--model", "google/nano-banana-edit", "--source", "dog", "--slug", "afg", "--mode", "single", "--size", "800x800", "--no-ai"]);
    expect(o.noAi).toBe(true);
  });

  it("rejects invalid mode and size", () => {
    expect(() => parseArgs(["--prompt", "p", "--source", "x", "--slug", "a", "--mode", "weird"])).toThrow(/mode/);
    expect(() => parseArgs(["--prompt", "p", "--source", "x", "--slug", "a", "--size", "100x100"])).toThrow(/size/);
  });
});
