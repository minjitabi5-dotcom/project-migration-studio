/** Browser-safe rules for the AI helper that drafts a sectioned playbook outline. */
import { TOOL_DEFAULTS, type ToolConfig, type ToolKey } from "./playbook";

export const OUTLINE_LIMITS = {
  title: 120,
  description: 4000,
  audience: 1000,
  goals: 2000,
} as const;
export const OUTLINE_DESCRIPTION_MIN_CHARS = 30;
export const OUTLINE_MAX_SECTIONS = 8;
export const OUTLINE_MAX_ITEMS_PER_SECTION = 6;

/** What the AI may suggest for each item. Files, videos and links become to-do notes. */
export const OUTLINE_ITEM_KINDS = ["note", "file", "video", "link", "tool"] as const;
export type OutlineSuggestionKind = (typeof OUTLINE_ITEM_KINDS)[number];

/** Built-in tools the AI may suggest (custom formulas are left to the creator). */
export const OUTLINE_TOOL_KEYS = ["profit", "cashflow", "budget", "crop_calendar", "materials"] as const;

export type OutlineSuggestion = {
  kind: OutlineSuggestionKind;
  title: string;
  description: string;
  toolKey: ToolKey | null;
};
export type OutlineSection = { title: string; items: OutlineSuggestion[] };

export type OutlineInput = { title: string; description: string; audience: string; goals: string };

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\r\n/g, "\n").replace(/\s+$/g, "").trim().slice(0, max) : "";

/** Validates the model's JSON; returns null when nothing usable came back. */
export function parsePlaybookOutline(text: string): OutlineSection[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const list = (raw as { sections?: unknown })?.sections;
  if (!Array.isArray(list)) return null;
  const sections: OutlineSection[] = [];
  for (const s of list.slice(0, OUTLINE_MAX_SECTIONS)) {
    const title = clean((s as { title?: unknown })?.title, 120);
    const rawItems = (s as { items?: unknown })?.items;
    if (!title || !Array.isArray(rawItems)) continue;
    const items: OutlineSuggestion[] = [];
    for (const it of rawItems.slice(0, OUTLINE_MAX_ITEMS_PER_SECTION)) {
      const o = it as { kind?: unknown; title?: unknown; description?: unknown; tool_key?: unknown };
      const kind = OUTLINE_ITEM_KINDS.includes(o.kind as OutlineSuggestionKind) ? (o.kind as OutlineSuggestionKind) : "note";
      const itemTitle = clean(o.title, 200);
      if (!itemTitle) continue;
      const toolKey =
        kind === "tool" && OUTLINE_TOOL_KEYS.includes(o.tool_key as (typeof OUTLINE_TOOL_KEYS)[number])
          ? (o.tool_key as ToolKey)
          : null;
      // A tool without a valid calculator becomes a note so the creator can decide.
      items.push({
        kind: kind === "tool" && !toolKey ? "note" : kind,
        title: itemTitle,
        description: clean(o.description, 1500),
        toolKey,
      });
    }
    if (items.length) sections.push({ title, items });
  }
  return sections.length ? sections : null;
}

const TODO_LABEL: Record<"file" | "video" | "link", string> = {
  file: "upload a file",
  video: "add a YouTube or Vimeo video",
  link: "add a link",
};

export type OutlineItemInsert = {
  section: string;
  kind: "text" | "tool";
  title: string;
  description: string;
  tool_key: ToolKey | null;
  tool_config: ToolConfig;
  position: number;
};

/**
 * Turns an approved outline into playbook rows. Files, videos and links can't exist without
 * the creator's own content, so they are saved as notes the creator later edits into the real thing.
 */
export function outlineToItems(sections: OutlineSection[], startPosition: number): OutlineItemInsert[] {
  const rows: OutlineItemInsert[] = [];
  let position = startPosition;
  sections.forEach((section, si) => {
    const sectionName = `${si + 1}. ${section.title.replace(/^\d+[.)]\s*/, "")}`.slice(0, 120);
    for (const item of section.items) {
      const base = { section: sectionName, title: item.title.slice(0, 200), position: position++ };
      if (item.kind === "tool" && item.toolKey) {
        rows.push({ ...base, kind: "tool", description: item.description.slice(0, 4000), tool_key: item.toolKey, tool_config: { ...TOOL_DEFAULTS[item.toolKey] } });
      } else if (item.kind === "file" || item.kind === "video" || item.kind === "link") {
        const todo = `To do: ${TODO_LABEL[item.kind]} here (edit this item and change its type).`;
        rows.push({
          ...base,
          kind: "text",
          description: (item.description ? `${todo}\n\n${item.description}` : todo).slice(0, 4000),
          tool_key: null,
          tool_config: {},
        });
      } else {
        rows.push({ ...base, kind: "text", description: (item.description || item.title).slice(0, 4000), tool_key: null, tool_config: {} });
      }
    }
  });
  return rows;
}

export function cleanOutlineInput(input: Partial<OutlineInput> | undefined): OutlineInput {
  return {
    title: clean(input?.title, OUTLINE_LIMITS.title),
    description: clean(input?.description, OUTLINE_LIMITS.description),
    audience: clean(input?.audience, OUTLINE_LIMITS.audience),
    goals: clean(input?.goals, OUTLINE_LIMITS.goals),
  };
}
