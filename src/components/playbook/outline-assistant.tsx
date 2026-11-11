import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { TOOL_LABELS } from "@/lib/playbook";
import {
  OUTLINE_DESCRIPTION_MIN_CHARS,
  OUTLINE_LIMITS,
  outlineToItems,
  type OutlineInput,
  type OutlineSection,
} from "@/lib/playbook-outline";
import { generatePlaybookOutline } from "@/lib/playbook-outline.functions";

const KIND_TEXT = { note: "Note", file: "File to upload", video: "Video to add", link: "Link to add", tool: "Calculator" } as const;

/**
 * Creator enters a description, audience and learning goals; the AI drafts sections and items.
 * Nothing is saved until the creator reviews the draft and presses "Add to playbook".
 */
export function OutlineAssistant({
  versionId,
  guideId,
  creatorId,
  nextPosition,
  defaults,
  onAdded,
  onClose,
}: {
  versionId: string;
  guideId: string;
  creatorId: string;
  nextPosition: number;
  defaults: OutlineInput;
  onAdded: () => Promise<void> | void;
  onClose: () => void;
}) {
  const generate = useServerFn(generatePlaybookOutline);
  const [form, setForm] = useState<OutlineInput>(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outline, setOutline] = useState<OutlineSection[] | null>(null);

  const set = (k: keyof OutlineInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (form.description.trim().length < OUTLINE_DESCRIPTION_MIN_CHARS) {
      return setError(`Describe the product in at least ${OUTLINE_DESCRIPTION_MIN_CHARS} characters.`);
    }
    setBusy(true);
    try {
      const result = await generate({ data: { versionId, ...form } });
      if (result.ok) setOutline(result.sections);
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI helper isn’t available right now.");
    }
    setBusy(false);
  }

  function removeItem(si: number, ii: number) {
    setOutline((o) =>
      (o ?? [])
        .map((s, i) => (i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s))
        .filter((s) => s.items.length > 0),
    );
  }
  function renameSection(si: number, title: string) {
    setOutline((o) => (o ?? []).map((s, i) => (i === si ? { ...s, title: title.slice(0, 110) } : s)));
  }

  async function addToPlaybook() {
    if (!outline?.length) return;
    if (outline.some((s) => !s.title.trim())) return void toast.error("Give every section a name.");
    setBusy(true);
    const rows = outlineToItems(outline, nextPosition).map((r) => ({
      ...r,
      tool_config: r.tool_config as Json,
      version_id: versionId,
      guide_id: guideId,
      creator_id: creatorId,
    }));
    const { error: insertError } = await supabase.from("product_items").insert(rows);
    setBusy(false);
    if (insertError) return void toast.error(insertError.message);
    toast.success(`Added ${rows.length} items in ${outline.length} sections. Replace the to-do notes with your files and videos.`);
    setOutline(null);
    await onAdded();
    onClose();
  }

  return (
    <div className="outline-assistant">
      <div className="outline-assistant-head">
        <h3>
          <Sparkles aria-hidden="true" /> Plan the outline with AI
        </h3>
        <Button size="icon" variant="ghost" aria-label="Close outline helper" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>

      {!outline ? (
        <form className="outline-assistant-form" onSubmit={(e) => void submit(e)}>
          <p className="field-hint">
            Tell the AI what the product is, who it’s for and what buyers should be able to do afterwards. It drafts
            sections for you to review — nothing is added until you press “Add to playbook”.
          </p>
          <label className="studio-field">
            Product description
            <Textarea
              rows={4}
              value={form.description}
              maxLength={OUTLINE_LIMITS.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. My step-by-step system for starting a 200-bird layer farm on a small plot, from housing to selling eggs."
              required
            />
          </label>
          <label className="studio-field">
            Audience
            <Textarea
              rows={2}
              value={form.audience}
              maxLength={OUTLINE_LIMITS.audience}
              onChange={(e) => set("audience", e.target.value)}
              placeholder="e.g. First-time farmers with a small budget and no livestock experience."
            />
          </label>
          <label className="studio-field">
            Learning goals <span className="field-hint">(one per line)</span>
            <Textarea
              rows={3}
              value={form.goals}
              maxLength={OUTLINE_LIMITS.goals}
              onChange={(e) => set("goals", e.target.value)}
              placeholder={"Set up housing that keeps birds healthy\nPlan feed costs\nFind steady egg buyers"}
            />
          </label>
          {error && (
            <p className="get-form-error" role="alert">
              {error}
            </p>
          )}
          <div className="product-form-actions">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles aria-hidden="true" />}
              {busy ? "Planning…" : "Generate outline"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="outline-draft">
          <p className="field-hint">
            Review the draft. Rename sections or remove items you don’t want. Files, videos and links are added as
            to-do notes you can turn into the real thing afterwards.
          </p>
          <ol className="outline-draft-sections">
            {outline.map((section, si) => (
              <li key={si}>
                <Input
                  aria-label={`Section ${si + 1} name`}
                  value={section.title}
                  onChange={(e) => renameSection(si, e.target.value)}
                />
                <ul>
                  {section.items.map((item, ii) => (
                    <li key={ii} className="outline-draft-item">
                      <div>
                        <span className="outline-kind">
                          {item.kind === "tool" && item.toolKey ? TOOL_LABELS[item.toolKey] : KIND_TEXT[item.kind]}
                        </span>
                        <strong>{item.title}</strong>
                        {item.description && <p>{item.description}</p>}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${item.title}`}
                        disabled={busy}
                        onClick={() => removeItem(si, ii)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div className="product-form-actions">
            <Button variant="ghost" disabled={busy} onClick={() => setOutline(null)}>
              Back
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void submit({ preventDefault() {} } as FormEvent<HTMLFormElement>)}>
              Try again
            </Button>
            <Button disabled={busy || !outline.length} onClick={() => void addToPlaybook()}>
              {busy && <LoaderCircle className="animate-spin" />} Add to playbook
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
