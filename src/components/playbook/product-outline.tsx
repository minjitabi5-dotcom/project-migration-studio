import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { groupBySection, ITEM_KIND_LABELS, TOOL_LABELS, type ItemKind, type ToolKey } from "@/lib/playbook";
import { KindIcon } from "./playbook-content";

type Row = {
  id: string;
  section: string;
  item_position: number;
  kind: string;
  title: string;
  description: string;
  tool_key: string | null;
};

/** Public outline of a playbook's sections and items — titles only; content unlocks once you get it. */
export function ProductOutline({ guideId }: { guideId: string }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let active = true;
    void supabase.rpc("product_outline", { p_guide_id: guideId }).then(({ data }) => {
      if (active) setRows((data as Row[] | null) ?? []);
    });
    return () => {
      active = false;
    };
  }, [guideId]);

  if (!rows.length) return null;
  const groups = groupBySection(rows.map((r) => ({ ...r, position: r.item_position })));
  const counts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {});

  return (
    <section className="product-outline" aria-label="What’s inside">
      <h2>What’s inside</h2>
      <p className="app-muted">
        {groups.length} section{groups.length === 1 ? "" : "s"} ·{" "}
        {Object.entries(counts)
          .map(([k, n]) => `${n} ${ITEM_KIND_LABELS[k as ItemKind]?.toLowerCase() ?? k}${n === 1 ? "" : "s"}`)
          .join(" · ")}
      </p>
      {groups.map((g, gi) => (
        <div key={g.section || `s${gi}`} className="outline-section">
          <h3>
            <span className="playbook-section-num">{String(gi + 1).padStart(2, "0")}</span>
            {g.section || "Contents"}
          </h3>
          <ul>
            {g.items.map((item) => (
              <li key={item.id}>
                <KindIcon kind={item.kind} />
                <span>
                  {item.title}
                  {item.kind === "tool" && item.tool_key && (
                    <small> · {TOOL_LABELS[item.tool_key as ToolKey] ?? "Interactive tool"}</small>
                  )}
                </span>
                <Lock aria-hidden="true" className="outline-lock" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
