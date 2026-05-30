import { describe, it, expect } from "vitest";
import { pickDistinct } from "./unsplash";

const photo = (id: string) =>
  ({ id, urls: { regular: `r-${id}`, small: `s-${id}` }, user: { name: "", links: { html: "" } }, links: { html: "" } });

describe("pickDistinct", () => {
  it("dedupes by id and caps at n", () => {
    const out = pickDistinct([photo("a"), photo("a"), photo("b"), photo("c")] as any, 2);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((p) => p.id)).size).toBe(2);
  });

  it("returns all distinct when fewer than n", () => {
    const out = pickDistinct([photo("a"), photo("b")] as any, 5);
    expect(out).toHaveLength(2);
  });
});
