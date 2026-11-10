import { useState } from "react";
import { CheckCircle2, Circle, Download, ExternalLink, FileText, LoaderCircle, PlayCircle, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groupBySection, videoEmbedUrl, type ItemKind, type ToolConfig } from "@/lib/playbook";
import { InteractiveTool } from "./interactive-tool";

export type ContentItem = {
  id: string;
  section: string;
  position: number;
  kind: ItemKind;
  title: string;
  description: string;
  file_name: string | null;
  url: string | null;
  tool_key: string | null;
  tool_config: unknown;
};

type Props = {
  items: ContentItem[];
  /** Starts the download of one playbook file. */
  onDownload: (itemId: string) => Promise<string | void>;
  /** When given, each item gets a “done” toggle (personal progress). */
  done?: Set<string>;
  onToggleDone?: (itemId: string) => void;
};

/** The full playbook for someone who has it: files, videos, links, notes and tools by section. */
export function PlaybookContent({ items, onDownload, done, onToggleDone }: Props) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!items.length) return null;

  async function download(id: string) {
    setBusy(id);
    setError("");
    try {
      const msg = await onDownload(id);
      if (msg) setError(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    }
    setBusy("");
  }

  return (
    <div className="playbook-content">
      {groupBySection(items).map((group, gi) => (
        <section key={group.section || `s${gi}`} className="playbook-section">
          <h3>
            <span className="playbook-section-num">{String(gi + 1).padStart(2, "0")}</span>
            {group.section || "Contents"}
          </h3>
          <ol className="playbook-items">
            {group.items.map((item) => {
              const isDone = done?.has(item.id) ?? false;
              const embed = item.kind === "video" && item.url ? videoEmbedUrl(item.url) : null;
              return (
                <li key={item.id} className={`playbook-item ${isDone ? "is-done" : ""}`}>
                  <div className="playbook-item-head">
                    <KindIcon kind={item.kind} />
                    <strong>{item.title}</strong>
                    {onToggleDone && (
                      <button
                        type="button"
                        className="playbook-done"
                        aria-pressed={isDone}
                        onClick={() => onToggleDone(item.id)}
                      >
                        {isDone ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
                        {isDone ? "Done" : "Mark done"}
                      </button>
                    )}
                  </div>
                  {item.description && item.kind !== "text" && <p className="playbook-item-desc">{item.description}</p>}
                  {item.kind === "text" && <p className="playbook-note pre-line">{item.description}</p>}
                  {item.kind === "file" && (
                    <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void download(item.id)}>
                      {busy === item.id ? <LoaderCircle className="animate-spin" /> : <Download aria-hidden="true" />}
                      {item.file_name ?? "Download"}
                    </Button>
                  )}
                  {item.kind === "video" && embed && (
                    <div className="playbook-video">
                      <iframe
                        src={embed}
                        title={item.title}
                        loading="lazy"
                        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  )}
                  {(item.kind === "link" || (item.kind === "video" && !embed)) && item.url && (
                    <a className="playbook-link" href={item.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden="true" /> Open {item.kind === "video" ? "video" : "link"}
                    </a>
                  )}
                  {item.kind === "tool" && item.tool_key && (
                    <InteractiveTool toolKey={item.tool_key} config={(item.tool_config ?? {}) as ToolConfig} />
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {error && (
        <p className="get-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function KindIcon({ kind }: { kind: string }) {
  if (kind === "file") return <FileText aria-hidden="true" className="kind-icon" />;
  if (kind === "video") return <PlayCircle aria-hidden="true" className="kind-icon" />;
  if (kind === "link") return <ExternalLink aria-hidden="true" className="kind-icon" />;
  if (kind === "tool") return <CalculatorIcon />;
  return <StickyNote aria-hidden="true" className="kind-icon" />;
}

function CalculatorIcon() {
  return (
    <svg aria-hidden="true" className="kind-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h4" />
    </svg>
  );
}
