import { describe, expect, it } from "vitest";
import {
  budgetCalc,
  cashflowCalc,
  cropCalendarCalc,
  evaluateFormula,
  groupBySection,
  materialsCalc,
  parseCustomFields,
  parseNamedNumbers,
  profitCalc,
  videoEmbedUrl,
} from "@/lib/playbook";

describe("playbook sections", () => {
  it("groups items by section in position order", () => {
    const groups = groupBySection([
      { section: "Setup", position: 2, id: "b" },
      { section: "Intro", position: 0, id: "a" },
      { section: "Setup", position: 1, id: "c" },
    ]);
    expect(groups.map((g) => g.section)).toEqual(["Intro", "Setup"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["c", "b"]);
  });
});

describe("video embeds", () => {
  it("embeds YouTube and Vimeo links", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
  });
  it("refuses other sites and plain http", () => {
    expect(videoEmbedUrl("https://example.com/video")).toBeNull();
    expect(videoEmbedUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("custom calculator formulas", () => {
  it("respects operator order and brackets", () => {
    expect(evaluateFormula("price * qty - discount", { price: 10, qty: 3, discount: 5 })).toBe(25);
    expect(evaluateFormula("(a + b) / 2", { a: 4, b: 6 })).toBe(5);
    expect(evaluateFormula("-a + 1", { a: 3 })).toBe(-2);
  });
  it("rejects unknown inputs and code", () => {
    expect(() => evaluateFormula("price * tax", { price: 1 })).toThrow(/Unknown input/);
    expect(() => evaluateFormula("alert(1);", {})).toThrow();
  });
  it("parses creator field lines", () => {
    expect(parseCustomFields("price | Price | 10\nbad key | x | 1\nqty||2")).toEqual([
      { key: "price", label: "Price", value: 10 },
      { key: "qty", label: "qty", value: 2 },
    ]);
  });
});

describe("built-in tools", () => {
  it("profit and break-even", () => {
    const r = profitCalc({ units: 100, price: 10, unitCost: 6, fixedCosts: 200 });
    expect(r.profit).toBe(200);
    expect(r.margin).toBe(20);
    expect(r.breakEvenUnits).toBe(50);
  });
  it("cash flow flags the first short month", () => {
    const r = cashflowCalc({ opening: 100, income: 50, expenses: 100, months: 4 });
    expect(r.rows.map((x) => x.balance)).toEqual([50, 0, -50, -100]);
    expect(r.firstShortMonth).toBe(3);
  });
  it("budget remaining", () => {
    expect(budgetCalc(1000, [{ name: "Rent", amount: 600 }]).remaining).toBe(400);
  });
  it("crop harvest dates", () => {
    expect(cropCalendarCalc("2026-03-01", [{ name: "Kale", days: 55 }])[0]!.harvest).toBe("2026-04-25");
  });
  it("materials rounds up with waste", () => {
    expect(materialsCalc({ length: 10, width: 4, coverage: 1.5, wastePercent: 10, unitPrice: 12 })).toEqual({
      area: 40,
      units: 30,
      cost: 360,
    });
  });
  it("parses named numbers", () => {
    expect(parseNamedNumbers("Rent: 600\nnothing\nFood = 400")).toEqual([
      { name: "Rent", value: 600 },
      { name: "Food", value: 400 },
    ]);
  });
});
