import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutList, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { PRODUCT_FILE_ACCEPT, PRODUCT_FILE_MAX_BYTES, resolveProductMime, safeStorageName } from "@/lib/creator-products";
import {
  ITEM_KINDS,
  ITEM_KIND_LABELS,
  TOOL_DEFAULTS,
  TOOL_DESCRIPTIONS,
  TOOL_KEYS,
  TOOL_LABELS,
  groupBySection,
  isHttpsUrl,
  str,
  type ItemKind,
  type ToolConfig,
  type ToolKey,
} from "@/lib/playbook";
import { KindIcon, PlaybookContent, type ContentItem } from "./playbook-content";
import { InteractiveTool } from "./interactive-tool";

type Item = Tables<"product_items">;

type Draft = {
  id?: string;
  section: string;
  kind: ItemKind;
  title: string;
  description: string;
  url: string;
  toolKey: ToolKey;
  toolConfig: ToolConfig;
  file: File | null;
  existingFileName: string | null;
};

const emptyDraft = (section = ""): Draft => ({
  section,
  kind: "file",
  title: "",
  description: "",
  url: "",
  toolKey: "profit",
  toolConfig: { ...TOOL_DEFAULTS.profit },
  file: null,
  existingFileName: null,
});

/**
 * Playbook builder: creators arrange files, videos, links, notes and interactive tools
 * into sections. Changes are only possible while the version is a draft or has changes requested.
 */
export function PlaybookItemsEditor({
  versionId,
  guideId,
  creatorId,
  editable,
}: {
  versionId: string;
  guideId: string;
  creatorId: string;
  editable: boolean;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("product_items")
      .select("*")
      .eq("version_id", versionId)
      .order("position")
      .order("created_at");
    if (error) toast.error(error.message);
    setItems(data ?? []);
  }, [versionId]);
  useEffect(() => void load(), [load]);

  const sections = useMemo(
    () => [...new Set((items ?? []).map((i) => i.section.trim()).filter(Boolean))],
    [items],
  );

  if (items === null) return null;

  async function move(index: number, dir: -1 | 1) {
    const list = [...(items ?? [])];
    const a = list[index];
    const b = list[index + dir];
    if (!a || !b) return;
    setBusy(true);
    // Re-number everything so positions are unique, then swap the pair.
    const order = list.map((i) => i.id);
    order[index] = b.id;
    order[index + dir] = a.id;
    const results = await Promise.all(
      order.map((id, pos) => supabase.from("product_items").update({ position: pos }).eq("id", id)),
    );
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) toast.error(failed.error.message);
    await load();
  }

  async function remove(item: Item) {
    if (!window.confirm(`Remove “${item.title}” from this playbook?`)) return;
    setBusy(true);
    const { error } = await supabase.from("product_items").delete().eq("id", item.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Item removed.");
    await load();
  }

  function startEdit(item: Item) {
    const key = (item.tool_key ?? "profit") as ToolKey;
    setDraft({
      id: item.id,
      section: item.section,
      kind: item.kind as ItemKind,
      title: item.title,
      description: item.description,
      url: item.url ?? "",
      toolKey: key,
      toolConfig: { ...TOOL_DEFAULTS[key], ...((item.tool_config ?? {}) as ToolConfig) },
      file: null,
      existingFileName: item.file_name,
    });
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    const d = draft;
    if (!d.title.trim()) return toast.error("Give the item a title.");
    if ((d.kind === "video" || d.kind === "link") && !isHttpsUrl(d.url.trim())) {
      return toast.error("Add a full https:// address.");
    }
    if (d.kind === "text" && d.description.trim().length < 3) return toast.error("Write the note.");
    if (d.kind === "file" && !d.file && !d.existingFileName) return toast.error("Choose a file to upload.");
    setBusy(true);
    try {
      let fileFields: Partial<Item> = {};
      if (d.kind === "file" && d.file) {
        const mime = resolveProductMime(d.file.name, d.file.type);
        if (!mime) throw new Error("That file type isn’t supported.");
        if (d.file.size > PRODUCT_FILE_MAX_BYTES) throw new Error("Files must be 500 MB or smaller.");
        const path = `${creatorId}/items/${crypto.randomUUID()}-${safeStorageName(d.file.name)}`;
        const { error: upErr } = await supabase.storage
          .from("creator-guides")
          .upload(path, d.file, { contentType: mime, upsert: false });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        fileFields = { file_path: path, file_name: d.file.name, file_size_bytes: d.file.size, file_mime: mime };
      }
      const values = {
        section: d.section.trim().slice(0, 120),
        kind: d.kind,
        title: d.title.trim().slice(0, 200),
        description: d.description.trim().slice(0, 4000),
        url: d.kind === "video" || d.kind === "link" ? d.url.trim() : null,
        tool_key: d.kind === "tool" ? d.toolKey : null,
        tool_config: (d.kind === "tool" ? d.toolConfig : {}) as Json,
        ...(d.kind !== "file" ? { file_path: null, file_name: null, file_size_bytes: null, file_mime: null } : {}),
        ...fileFields,
      };
      if (d.id) {
        const { error } = await supabase.from("product_items").update(values).eq("id", d.id);
        if (error) throw new Error(error.message);
      } else {
        const position = (items ?? []).reduce((m, i) => Math.max(m, i.position + 1), 0);
        const { error } = await supabase
          .from("product_items")
          .insert({ ...values, version_id: versionId, guide_id: guideId, creator_id: creatorId, position });
        if (error) throw new Error(error.message);
      }
      toast.success(d.id ? "Item updated." : "Item added.");
      setDraft(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t save the item.");
    }
    setBusy(false);
  }

  async function previewDownload(itemId: string) {
    const item = items?.find((i) => i.id === itemId);
    if (!item?.file_path) return "This file isn’t uploaded yet.";
    const { data, error } = await supabase.storage
      .from("creator-guides")
      .createSignedUrl(item.file_path, 60, { download: item.file_name ?? true });
    if (error || !data) return "Couldn’t open the file.";
    window.location.assign(data.signedUrl);
  }

  const sorted = [...items].sort((a, b) => a.position - b.position);

  return (
    <section className="dash-section playbook-editor" aria-label="Playbook builder">
      <div className="dash-section-head">
        <h2>
          <LayoutList aria-hidden="true" /> Playbook builder
        </h2>
        {items.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {preview ? "Back to editing" : "Preview as buyer"}
          </Button>
        )}
      </div>
      <p className="app-muted">
        Package everything into one product: arrange guides, worksheets, spreadsheets, videos, links, notes and
        interactive tools into sections. Buyers see the section outline on your product page and the full
        content once they get it.
      </p>

      {preview ? (
        <PlaybookContent items={sorted as unknown as ContentItem[]} onDownload={previewDownload} />
      ) : (
        <>
          {items.length === 0 ? (
            <p className="playbook-empty">No sections yet.</p>
          ) : (
            groupBySection(sorted).map((group, gi) => (
              <div key={group.section || `s${gi}`} className="playbook-editor-section">
                <h3>
                  <span className="playbook-section-num">{String(gi + 1).padStart(2, "0")}</span>
                  {group.section || "Contents (no section name)"}
                </h3>
                <ul>
                  {group.items.map((item) => {
                    const index = sorted.findIndex((s) => s.id === item.id);
                    return (
                      <li key={item.id} className="playbook-editor-item">
                        <KindIcon kind={item.kind} />
                        <div>
                          <strong>{item.title}</strong>
                          <small>
                            {ITEM_KIND_LABELS[item.kind as ItemKind]}
                            {item.kind === "file" && item.file_name ? ` · ${item.file_name}` : ""}
                            {item.kind === "tool" && item.tool_key ? ` · ${TOOL_LABELS[item.tool_key as ToolKey]}` : ""}
                            {(item.kind === "video" || item.kind === "link") && item.url ? ` · ${item.url}` : ""}
                          </small>
                        </div>
                        {editable && (
                          <div className="playbook-editor-actions">
                            <Button size="icon" variant="ghost" aria-label="Move up" disabled={busy || index === 0} onClick={() => void move(index, -1)}>
                              <ArrowUp aria-hidden="true" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="Move down" disabled={busy || index === sorted.length - 1} onClick={() => void move(index, 1)}>
                              <ArrowDown aria-hidden="true" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="Edit item" disabled={busy} onClick={() => startEdit(item)}>
                              <Pencil aria-hidden="true" />
                            </Button>
                            <Button size="icon" variant="ghost" aria-label="Remove item" disabled={busy} onClick={() => void remove(item)}>
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}

          {editable ? (
            draft ? (
              <ItemForm
                draft={draft}
                sections={sections}
                busy={busy}
                onChange={setDraft}
                onCancel={() => setDraft(null)}
                onSubmit={save}
              />
            ) : (
              <div>
                <Button size="sm" variant="outline" onClick={() => setDraft(emptyDraft(sections.at(-1) ?? ""))}>
                  <Plus aria-hidden="true" /> Add to playbook
                </Button>
              </div>
            )
          ) : (
            <p className="field-hint">
              {items.length
                ? "Playbook content is locked while this version is in review or live. Start an edit to change it."
                : "Start an edit (or open a draft) to add sections, files, videos and tools."}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ItemForm({
  draft,
  sections,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: Draft;
  sections: string[];
  busy: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  return (
    <form className="playbook-item-form" onSubmit={onSubmit}>
      <h3>{draft.id ? "Edit item" : "Add to playbook"}</h3>
      <div className="product-form-row">
        <label className="studio-field">
          Section
          <Input
            list="playbook-sections"
            value={draft.section}
            onChange={(e) => set("section", e.target.value)}
            maxLength={120}
            placeholder="e.g. 1. Getting started"
          />
          <datalist id="playbook-sections">
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <span className="field-hint">Pick an existing section or type a new one.</span>
        </label>
        <div className="studio-field" role="group" aria-label="Item type">
          <span>Type</span>
          <div className="kind-picker">
            {ITEM_KINDS.map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={draft.kind === k ? "default" : "outline"}
                aria-pressed={draft.kind === k}
                onClick={() => set("kind", k)}
              >
                {ITEM_KIND_LABELS[k]}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <label className="studio-field">
        Title
        <Input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required />
      </label>

      {draft.kind === "file" && (
        <div className="studio-field">
          <span>File</span>
          <div className="upload-file-name">
            {draft.file ? draft.file.name : draft.existingFileName ?? "No file chosen"}
          </div>
          <label className="upload-button">
            <input type="file" accept={PRODUCT_FILE_ACCEPT} onChange={(e) => set("file", e.target.files?.[0] ?? null)} />
            {draft.file || draft.existingFileName ? "Replace file" : "Choose file"}
          </label>
          <span className="field-hint">PDF guide, worksheet, checklist, spreadsheet, template, slides, audio or video — up to 500 MB.</span>
        </div>
      )}
      {(draft.kind === "video" || draft.kind === "link") && (
        <label className="studio-field">
          {draft.kind === "video" ? "Video address (YouTube or Vimeo)" : "Link address"}
          <Input type="url" value={draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" required />
        </label>
      )}
      {draft.kind === "tool" && (
        <div className="studio-field">
          <span>Tool</span>
          <select
            className="app-select"
            value={draft.toolKey}
            onChange={(e) => {
              const key = e.target.value as ToolKey;
              onChange({ ...draft, toolKey: key, toolConfig: { ...TOOL_DEFAULTS[key] } });
            }}
          >
            {TOOL_KEYS.map((k) => (
              <option key={k} value={k}>
                {TOOL_LABELS[k]}
              </option>
            ))}
          </select>
          <span className="field-hint">{TOOL_DESCRIPTIONS[draft.toolKey]}</span>
          <ToolConfigEditor toolKey={draft.toolKey} config={draft.toolConfig} onChange={(c) => set("toolConfig", c)} />
          <p className="field-hint">Live preview — buyers start from your values:</p>
          <InteractiveTool key={JSON.stringify(draft.toolConfig) + draft.toolKey} toolKey={draft.toolKey} config={draft.toolConfig} title={draft.title} />
        </div>
      )}

      <label className="studio-field">
        {draft.kind === "text" ? "Note" : "Description"} {draft.kind !== "text" && <span className="field-hint">(optional)</span>}
        <Textarea
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          rows={draft.kind === "text" ? 6 : 2}
          maxLength={4000}
          placeholder={draft.kind === "text" ? "Write guidance, steps or tips for this section." : "What this is and how to use it."}
        />
      </label>
      <div className="product-form-actions">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          <X aria-hidden="true" /> Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />} {draft.id ? "Save item" : "Add item"}
        </Button>
      </div>
    </form>
  );
}

const NUMBER_FIELDS: Partial<Record<ToolKey, [string, string][]>> = {
  profit: [
    ["units", "Units"],
    ["price", "Price per unit"],
    ["unitCost", "Cost per unit"],
    ["fixedCosts", "Fixed costs"],
  ],
  cashflow: [
    ["opening", "Starting balance"],
    ["income", "Monthly money in"],
    ["expenses", "Monthly money out"],
    ["months", "Months"],
  ],
  budget: [["income", "Monthly income"]],
  materials: [
    ["length", "Length"],
    ["width", "Width"],
    ["coverage", "Area one unit covers"],
    ["wastePercent", "Waste %"],
    ["unitPrice", "Price per unit"],
  ],
};

function ToolConfigEditor({ toolKey, config, onChange }: { toolKey: ToolKey; config: ToolConfig; onChange: (c: ToolConfig) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...config, [k]: v });
  return (
    <div className="tool-config">
      {(NUMBER_FIELDS[toolKey] ?? []).map(([k, label]) => (
        <label key={k} className="tool-field">
          <span>{label}</span>
          <Input type="number" value={String(config[k] ?? "")} onChange={(e) => set(k, Number(e.target.value))} />
        </label>
      ))}
      {(toolKey === "profit" || toolKey === "materials") && (
        <label className="tool-field">
          <span>Unit name</span>
          <Input value={str(config, "unitLabel")} onChange={(e) => set("unitLabel", e.target.value.slice(0, 30))} placeholder="e.g. birds, bags, tiles" />
        </label>
      )}
      {(toolKey === "budget" || toolKey === "crop_calendar") && (
        <label className="tool-field tool-field-wide">
          <span>{toolKey === "budget" ? "Spending lines (“Name: amount”)" : "Crops (“Crop: days to maturity”)"}</span>
          <Textarea rows={4} value={str(config, "lines")} onChange={(e) => set("lines", e.target.value.slice(0, 2000))} />
        </label>
      )}
      {toolKey === "custom" && (
        <>
          <label className="tool-field tool-field-wide">
            <span>Inputs (one per line: “name | Label | default”)</span>
            <Textarea rows={4} value={str(config, "fields")} onChange={(e) => set("fields", e.target.value.slice(0, 2000))} />
          </label>
          <label className="tool-field tool-field-wide">
            <span>Formula (use input names with + − × ÷ and brackets)</span>
            <Input value={str(config, "formula")} onChange={(e) => set("formula", e.target.value.slice(0, 300))} placeholder="price * qty" />
          </label>
          <label className="tool-field">
            <span>Result label</span>
            <Input value={str(config, "resultLabel")} onChange={(e) => set("resultLabel", e.target.value.slice(0, 60))} />
          </label>
        </>
      )}
    </div>
  );
}
