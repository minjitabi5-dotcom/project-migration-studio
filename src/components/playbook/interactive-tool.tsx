import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  TOOL_LABELS,
  budgetCalc,
  cashflowCalc,
  cropCalendarCalc,
  evaluateFormula,
  materialsCalc,
  num,
  parseCustomFields,
  parseNamedNumbers,
  profitCalc,
  str,
  type ToolConfig,
  type ToolKey,
} from "@/lib/playbook";

const fmt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="tool-field">
      <span>{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </label>
  );
}

function Result({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={`tool-result ${tone ? `is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** A creator's interactive tool, usable right inside Doerly. Values stay in the browser. */
export function InteractiveTool({ toolKey, config, title }: { toolKey: string; config: ToolConfig; title?: string }) {
  const key = toolKey as ToolKey;
  return (
    <div className="tool-card">
      <p className="tool-card-head">
        <Calculator aria-hidden="true" /> {title || TOOL_LABELS[key] || "Interactive tool"}
      </p>
      {key === "profit" && <ProfitTool config={config} />}
      {key === "cashflow" && <CashflowTool config={config} />}
      {key === "budget" && <BudgetTool config={config} />}
      {key === "crop_calendar" && <CropTool config={config} />}
      {key === "materials" && <MaterialsTool config={config} />}
      {key === "custom" && <CustomTool config={config} />}
    </div>
  );
}

function ProfitTool({ config }: { config: ToolConfig }) {
  const unit = str(config, "unitLabel", "units") || "units";
  const [v, setV] = useState({
    units: num(config, "units", 100),
    price: num(config, "price", 10),
    unitCost: num(config, "unitCost", 6),
    fixedCosts: num(config, "fixedCosts", 200),
  });
  const r = profitCalc(v);
  const set = (k: keyof typeof v) => (n: number) => setV((s) => ({ ...s, [k]: n }));
  return (
    <>
      <div className="tool-grid">
        <NumberField label={`Number of ${unit}`} value={v.units} onChange={set("units")} />
        <NumberField label={`Selling price per ${unit.replace(/s$/, "")}`} value={v.price} onChange={set("price")} />
        <NumberField label="Cost per item" value={v.unitCost} onChange={set("unitCost")} />
        <NumberField label="Fixed costs" value={v.fixedCosts} onChange={set("fixedCosts")} />
      </div>
      <div className="tool-results">
        <Result label="Revenue" value={fmt(r.revenue)} />
        <Result label="Total cost" value={fmt(r.totalCost)} />
        <Result label="Profit" value={fmt(r.profit)} tone={r.profit >= 0 ? "good" : "bad"} />
        <Result label="Margin" value={`${fmt(r.margin)}%`} />
        <Result label="Break-even" value={r.breakEvenUnits === null ? "Never at this price" : `${fmt(r.breakEvenUnits)} ${unit}`} />
      </div>
    </>
  );
}

function CashflowTool({ config }: { config: ToolConfig }) {
  const [v, setV] = useState({
    opening: num(config, "opening", 1000),
    income: num(config, "income", 1500),
    expenses: num(config, "expenses", 1300),
    months: num(config, "months", 12),
  });
  const r = cashflowCalc(v);
  const set = (k: keyof typeof v) => (n: number) => setV((s) => ({ ...s, [k]: n }));
  return (
    <>
      <div className="tool-grid">
        <NumberField label="Starting balance" value={v.opening} onChange={set("opening")} />
        <NumberField label="Money in each month" value={v.income} onChange={set("income")} />
        <NumberField label="Money out each month" value={v.expenses} onChange={set("expenses")} />
        <NumberField label="Months to plan" value={v.months} onChange={set("months")} />
      </div>
      <div className="tool-results">
        <Result label="Closing balance" value={fmt(r.closing)} tone={r.closing >= 0 ? "good" : "bad"} />
        <Result label="First short month" value={r.firstShortMonth ? `Month ${r.firstShortMonth}` : "None"} tone={r.firstShortMonth ? "bad" : "good"} />
      </div>
      <ol className="tool-table">
        {r.rows.map((row) => (
          <li key={row.month} className={row.balance < 0 ? "is-bad" : ""}>
            <span>Month {row.month}</span>
            <strong>{fmt(row.balance)}</strong>
          </li>
        ))}
      </ol>
    </>
  );
}

function BudgetTool({ config }: { config: ToolConfig }) {
  const [income, setIncome] = useState(num(config, "income", 2000));
  const [lines, setLines] = useState(str(config, "lines"));
  const r = useMemo(
    () => budgetCalc(income, parseNamedNumbers(lines).map((l) => ({ name: l.name, amount: l.value }))),
    [income, lines],
  );
  return (
    <>
      <div className="tool-grid">
        <NumberField label="Monthly income" value={income} onChange={setIncome} />
        <label className="tool-field tool-field-wide">
          <span>Spending (one per line, “Name: amount”)</span>
          <Textarea rows={4} value={lines} onChange={(e) => setLines(e.target.value)} />
        </label>
      </div>
      <div className="tool-results">
        <Result label="Planned spending" value={fmt(r.total)} />
        <Result label="Left over" value={fmt(r.remaining)} tone={r.remaining >= 0 ? "good" : "bad"} />
      </div>
      <ul className="tool-table">
        {r.shares.map((s) => (
          <li key={s.name}>
            <span>{s.name}</span>
            <strong>
              {fmt(s.amount)} · {fmt(s.percent)}%
            </strong>
          </li>
        ))}
      </ul>
    </>
  );
}

function CropTool({ config }: { config: ToolConfig }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState(str(config, "lines"));
  const rows = cropCalendarCalc(date, parseNamedNumbers(lines).map((l) => ({ name: l.name, days: l.value })));
  return (
    <>
      <div className="tool-grid">
        <label className="tool-field">
          <span>Planting date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="tool-field tool-field-wide">
          <span>Crops (one per line, “Crop: days to maturity”)</span>
          <Textarea rows={4} value={lines} onChange={(e) => setLines(e.target.value)} />
        </label>
      </div>
      <ul className="tool-table">
        {rows.map((r) => (
          <li key={r.name}>
            <span>
              {r.name} · {r.days} days
            </span>
            <strong>Harvest {new Date(`${r.harvest}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" })}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}

function MaterialsTool({ config }: { config: ToolConfig }) {
  const unit = str(config, "unitLabel", "units") || "units";
  const [v, setV] = useState({
    length: num(config, "length", 10),
    width: num(config, "width", 4),
    coverage: num(config, "coverage", 1.5),
    wastePercent: num(config, "wastePercent", 10),
    unitPrice: num(config, "unitPrice", 12),
  });
  const r = materialsCalc(v);
  const set = (k: keyof typeof v) => (n: number) => setV((s) => ({ ...s, [k]: n }));
  return (
    <>
      <div className="tool-grid">
        <NumberField label="Length" value={v.length} onChange={set("length")} />
        <NumberField label="Width" value={v.width} onChange={set("width")} />
        <NumberField label={`Area one of the ${unit} covers`} value={v.coverage} onChange={set("coverage")} />
        <NumberField label="Extra for waste (%)" value={v.wastePercent} onChange={set("wastePercent")} />
        <NumberField label={`Price per ${unit.replace(/s$/, "")}`} value={v.unitPrice} onChange={set("unitPrice")} />
      </div>
      <div className="tool-results">
        <Result label="Area" value={fmt(r.area)} />
        <Result label={`${unit} needed`} value={fmt(r.units)} />
        <Result label="Estimated cost" value={fmt(r.cost)} />
      </div>
    </>
  );
}

function CustomTool({ config }: { config: ToolConfig }) {
  const fields = useMemo(() => parseCustomFields(str(config, "fields")), [config]);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );
  let result: string;
  try {
    result = fmt(evaluateFormula(str(config, "formula", "0"), values));
  } catch {
    result = "Check the inputs";
  }
  return (
    <>
      <div className="tool-grid">
        {fields.map((f) => (
          <NumberField
            key={f.key}
            label={f.label}
            value={values[f.key] ?? 0}
            onChange={(n) => setValues((s) => ({ ...s, [f.key]: n }))}
          />
        ))}
      </div>
      <div className="tool-results">
        <Result label={str(config, "resultLabel", "Result") || "Result"} value={result} />
      </div>
    </>
  );
}
