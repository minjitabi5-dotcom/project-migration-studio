import { describe, expect, it } from "vitest";
import { cleanOutlineInput, outlineToItems, parsePlaybookOutline } from "@/lib/playbook-outline";

const sample = JSON.stringify({
  sections: [
    {
      title: "Getting started",
      items: [
        { kind: "note", title: "Why layers", description: "I start here.", tool_key: "none" },
        { kind: "file", title: "Setup checklist", description: "A one-page checklist.", tool_key: "none" },
      ],
    },
    {
      title: "Money",
      items: [
        { kind: "tool", title: "Profit per bird", description: "Work out margins.", tool_key: "profit" },
        { kind: "tool", title: "Mystery tool", description: "", tool_key: "custom" },
      ],
    },
    { title: "Empty", items: [] },
  ],
});

describe("parsePlaybookOutline", () => {
  it("keeps valid sections and drops empty ones", () => {
    const parsed = parsePlaybookOutline(sample);
    expect(parsed?.map((s) => s.title)).toEqual(["Getting started", "Money"]);
  });
  it("turns a tool without an allowed calculator into a note", () => {
    const parsed = parsePlaybookOutline(sample);
    expect(parsed?.[1]?.items[1]).toMatchObject({ kind: "note", toolKey: null });
  });
  it("rejects non-JSON", () => {
    expect(parsePlaybookOutline("not json")).toBeNull();
  });
  it("caps sections at 8", () => {
    const many = { sections: Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, items: [{ kind: "note", title: "x", description: "y" }] })) };
    expect(parsePlaybookOutline(JSON.stringify(many))?.length).toBe(8);
  });
});

describe("outlineToItems", () => {
  it("numbers sections, keeps tools and saves files as to-do notes after existing items", () => {
    const rows = outlineToItems(parsePlaybookOutline(sample)!, 4);
    expect(rows.map((r) => r.position)).toEqual([4, 5, 6, 7]);
    expect(rows[0]).toMatchObject({ section: "1. Getting started", kind: "text", description: "I start here." });
    expect(rows[1]?.kind).toBe("text");
    expect(rows[1]?.description.startsWith("To do: upload a file")).toBe(true);
    expect(rows[2]).toMatchObject({ section: "2. Money", kind: "tool", tool_key: "profit" });
  });
});

describe("cleanOutlineInput", () => {
  it("trims and limits the description to 4000 characters", () => {
    expect(cleanOutlineInput({ description: `  ${"a".repeat(5000)}` }).description.length).toBe(4000);
  });
});
