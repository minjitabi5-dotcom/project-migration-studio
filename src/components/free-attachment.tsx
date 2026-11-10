import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gift, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFreeAttachment } from "@/lib/product-content.functions";

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Instant download of the creator's free attachment — no sign-in or email needed. */
export function FreeAttachmentButton({ guideId, fileName, sizeBytes }: { guideId: string; fileName: string; sizeBytes: number | null }) {
  const get = useServerFn(getFreeAttachment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const r = await get({ data: { guideId } });
      if ("url" in r) window.location.assign(r.url);
      else setError(r.error);
    } catch {
      setError("We couldn’t start the download. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="free-attachment">
      <p className="free-attachment-label">
        <Gift aria-hidden="true" /> Free download
      </p>
      <Button variant="outline" className="free-attachment-button" disabled={busy} onClick={() => void download()}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Gift aria-hidden="true" />}
        <span>
          {fileName}
          {sizeBytes ? <small> · {formatBytes(sizeBytes)}</small> : null}
        </span>
      </Button>
      <p className="purchase-note">Download it straight away — no email needed.</p>
      {error && (
        <p className="get-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
