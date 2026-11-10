import { describe, expect, it } from "vitest";
import { ratingBreakdown, reviewOverall } from "@/lib/reviews";
import { parseSpecializations, parseYearsExperience } from "@/lib/creator-profile";

describe("product reviews", () => {
  it("overall rating averages the three scores", () => {
    expect(reviewOverall({ usefulness: 5, clarity: 4, listing_accuracy: 3 })).toBe(4);
    expect(reviewOverall({ usefulness: 5, clarity: 5, listing_accuracy: 4 })).toBe(4.7);
  });
  it("breakdown counts reviews per rounded star level", () => {
    const b = ratingBreakdown([
      { usefulness: 5, clarity: 5, listing_accuracy: 5 },
      { usefulness: 5, clarity: 5, listing_accuracy: 4 },
      { usefulness: 2, clarity: 2, listing_accuracy: 2 },
    ]);
    expect(b.find((x) => x.stars === 5)?.count).toBe(2);
    expect(b.find((x) => x.stars === 2)?.count).toBe(1);
  });
});

describe("expert profiles", () => {
  it("limits specialisations to 10 unique entries", () => {
    expect(parseSpecializations("Layers, layers, Broilers,, Feed")).toEqual(["Layers", "Broilers", "Feed"]);
    expect(parseSpecializations(Array.from({ length: 15 }, (_, i) => `s${i}`).join(","))).toHaveLength(10);
  });
  it("years of experience are 0–80 whole numbers or blank", () => {
    expect(parseYearsExperience("")).toEqual({ ok: true, value: null });
    expect(parseYearsExperience("12")).toEqual({ ok: true, value: 12 });
    expect(parseYearsExperience("81").ok).toBe(false);
    expect(parseYearsExperience("2.5").ok).toBe(false);
  });
});
