/** Browser-safe rules for playbook sections, videos and interactive tools. */

export const ITEM_KINDS = ["file", "video", "link", "text", "tool"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  file: "File",
  video: "Video",
  link: "Link",
  text: "Note",
  tool: "Interactive tool",
};

export const TOOL_KEYS = ["profit", "cashflow", "budget", "crop_calendar", "materials", "custom"] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

export const TOOL_LABELS: Record<ToolKey, string> = {
  profit: "Profitability calculator",
  cashflow: "Cash flow planner",
  budget: "Budget planner",
  crop_calendar: "Crop planning calendar",
  materials: "Materials estimator",
  custom: "Custom calculator",
};

export const TOOL_DESCRIPTIONS: Record<ToolKey, string> = {
  profit: "Profit, margin and break-even from units, price and costs.",
  cashflow: "Month-by-month balance from income and expenses.",
  budget: "Split monthly income across spending categories.",
  crop_calendar: "Harvest dates from a planting date and days to maturity.",
  materials: "How many units of a material an area needs, and the cost.",
  custom: "Your own formula with your own inputs.",
};

export type OutlineItem = {
  id: string;
  section: string;
  position: number;
  kind: ItemKind;
  title: string;
  description: string;
  tool_key: string | null;
};

/** Groups items into sections in the order they first appear (items sorted by position). */
export function groupBySection<T extends { section: string; position: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const groups: { section: string; items: T[] }[] = [];
  for (const item of sorted) {
    const name = item.section.trim();
    let group = groups.find((g) => g.section === name);
    if (!group) {
      group = { section: name, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** Turns a YouTube or Vimeo address into a privacy-friendly embed address; null if not embeddable. */
export function videoEmbedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/^www\.|^m\./, "");
  const idPattern = /^[A-Za-z0-9_-]{6,20}$/;
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0] ?? "";
    return idPattern.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    const id =
      parsed.searchParams.get("v") ??
      (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" ? parts[1] : undefined) ??
      "";
    return idPattern.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parsed.pathname.split("/").filter(Boolean).find((p) => /^\d{5,12}$/.test(p));
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

export function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:" && value.length <= 1000;
  } catch {
    return false;
  }
}

// ---------- Formula evaluation for custom calculators ----------

type Token = { type: "num"; value: number } | { type: "id"; value: string } | { type: "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j++;
      const value = Number(input.slice(i, j));
      if (!Number.isFinite(value)) throw new Error(`Bad number "${input.slice(i, j)}"`);
      tokens.push({ type: "num", value });
      i = j;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j]!)) j++;
      tokens.push({ type: "id", value: input.slice(i, j) });
      i = j;
    } else if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else {
      throw new Error(`Unexpected "${ch}" in formula`);
    }
  }
  return tokens;
}

/** Evaluates + - * / and brackets over named numbers. Throws on unknown names or bad syntax. */
export function evaluateFormula(formula: string, vars: Record<string, number>): number {
  const tokens = tokenize(formula);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];

  function primary(): number {
    const t = take();
    if (!t) throw new Error("Formula ends too early");
    if (t.type === "num") return t.value;
    if (t.type === "id") {
      if (!(t.value in vars)) throw new Error(`Unknown input "${t.value}"`);
      return vars[t.value]!;
    }
    if (t.value === "(") {
      const v = expr();
      const close = take();
      if (!close || close.value !== ")") throw new Error("Missing closing bracket");
      return v;
    }
    if (t.value === "-") return -primary();
    if (t.value === "+") return primary();
    throw new Error(`Unexpected "${t.value}"`);
  }
  function term(): number {
    let v = primary();
    for (let t = peek(); t && t.type === "op" && (t.value === "*" || t.value === "/"); t = peek()) {
      take();
      const r = primary();
      v = t.value === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    for (let t = peek(); t && t.type === "op" && (t.value === "+" || t.value === "-"); t = peek()) {
      take();
      const r = term();
      v = t.value === "+" ? v + r : v - r;
    }
    return v;
  }
  const result = expr();
  if (pos < tokens.length) throw new Error("Unexpected text at the end of the formula");
  return result;
}

// ---------- Built-in tool calculations ----------

export function profitCalc(i: { units: number; price: number; unitCost: number; fixedCosts: number }) {
  const revenue = i.units * i.price;
  const totalCost = i.units * i.unitCost + i.fixedCosts;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const perUnit = i.price - i.unitCost;
  const breakEvenUnits = perUnit > 0 ? Math.ceil(i.fixedCosts / perUnit) : null;
  return { revenue, totalCost, profit, margin, breakEvenUnits };
}

export function cashflowCalc(i: { opening: number; income: number; expenses: number; months: number }) {
  const months = Math.max(1, Math.min(60, Math.round(i.months)));
  const rows: { month: number; balance: number }[] = [];
  let balance = i.opening;
  let firstShortMonth: number | null = null;
  for (let m = 1; m <= months; m++) {
    balance += i.income - i.expenses;
    rows.push({ month: m, balance });
    if (balance < 0 && firstShortMonth === null) firstShortMonth = m;
  }
  return { rows, closing: balance, firstShortMonth };
}

export function budgetCalc(income: number, lines: { name: string; amount: number }[]) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return {
    total,
    remaining: income - total,
    shares: lines.map((l) => ({ ...l, percent: income > 0 ? (l.amount / income) * 100 : 0 })),
  };
}

export function cropCalendarCalc(plantingDate: string, crops: { name: string; days: number }[]) {
  const start = new Date(`${plantingDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];
  return crops.map((c) => {
    const harvest = new Date(start.getTime() + Math.round(c.days) * 86_400_000);
    return { name: c.name, days: c.days, harvest: harvest.toISOString().slice(0, 10) };
  });
}

export function materialsCalc(i: { length: number; width: number; coverage: number; wastePercent: number; unitPrice: number }) {
  const area = i.length * i.width;
  const needed = i.coverage > 0 ? (area / i.coverage) * (1 + i.wastePercent / 100) : 0;
  const units = Math.ceil(needed);
  return { area, units, cost: units * i.unitPrice };
}

/** "Name: 123" per line → [{ name, value }]; skips lines without a number. */
export function parseNamedNumbers(text: string) {
  return text
    .split(/\n+/)
    .map((line) => {
      const m = line.match(/^\s*(.+?)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*$/);
      return m ? { name: m[1]!.slice(0, 60), value: Number(m[2]) } : null;
    })
    .filter((x): x is { name: string; value: number } => x !== null)
    .slice(0, 30);
}

export type CustomField = { key: string; label: string; value: number };

/** "key | Label | default" per line → fields; keys must be simple names. */
export function parseCustomFields(text: string): CustomField[] {
  return text
    .split(/\n+/)
    .map((line) => {
      const [key = "", label = "", value = "0"] = line.split("|").map((s) => s.trim());
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(key)) return null;
      const n = Number(value);
      return { key, label: (label || key).slice(0, 60), value: Number.isFinite(n) ? n : 0 };
    })
    .filter((x): x is CustomField => x !== null)
    .slice(0, 20);
}

export type ToolConfig = Record<string, unknown>;

export function num(config: ToolConfig, key: string, fallback: number) {
  const v = Number(config[key]);
  return Number.isFinite(v) ? v : fallback;
}

export function str(config: ToolConfig, key: string, fallback = "") {
  const v = config[key];
  return typeof v === "string" ? v : fallback;
}

/** Starting values a creator can set for each built-in tool. */
export const TOOL_DEFAULTS: Record<ToolKey, ToolConfig> = {
  profit: { units: 100, price: 10, unitCost: 6, fixedCosts: 200, unitLabel: "units" },
  cashflow: { opening: 1000, income: 1500, expenses: 1300, months: 12 },
  budget: { income: 2000, lines: "Rent: 600\nFood: 400\nTransport: 150\nSavings: 300" },
  crop_calendar: { lines: "Tomatoes: 75\nKale: 55\nMaize: 100" },
  materials: { length: 10, width: 4, coverage: 1.5, wastePercent: 10, unitPrice: 12, unitLabel: "units" },
  custom: { fields: "price | Price per item | 10\nqty | Quantity | 5", formula: "price * qty", resultLabel: "Total" },
};
