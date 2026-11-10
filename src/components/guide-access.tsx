import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMarketplaceAuth } from "@/hooks/use-marketplace-auth";
import { supabase } from "@/integrations/supabase/client";
import { getResourceDownload } from "@/lib/resource-access.functions";
import { requestResourceByEmail } from "@/lib/resource-delivery.functions";
import { PAID_LINK_HOURS } from "@/lib/download-links";

type Entitlement = { id: string; version_id: string; guide_id: string };

export function useDownload() {
  const download = useServerFn(getResourceDownload);
  return async (entitlementId: string) => {
    const result = (await download({ data: { entitlementId } })) as { url?: string } | undefined;
    if (result?.url) window.location.assign(result.url);
  };
}

export function useEntitlement(guideId: string) {
  const { user, ready } = useMarketplaceAuth();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const refresh = useCallback(async () => {
    if (!user) return setEntitlement(null);
    const { data } = await supabase
      .from("entitlements")
      .select("id, version_id, guide_id")
      .eq("guide_id", guideId)
      .eq("buyer_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setEntitlement(data);
  }, [guideId, user]);
  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);
  return { user, entitlement, refresh };
}

export function GuideAccessPanel({ guideId, priceCents, isSample }: { guideId: string; priceCents: number; isSample: boolean }) {
  const { user, entitlement } = useEntitlement(guideId);
  const download = useDownload();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function doDownload() {
    if (!entitlement) return;
    setBusy(true);
    setMsg("");
    try {
      await download(entitlement.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Download failed.");
    }
    setBusy(false);
  }

  if (isSample)
    return (
      <Button className="purchase-unavailable" disabled>
        <LockKeyhole aria-hidden="true" /> Example listing
      </Button>
    );

  if (priceCents > 0)
    return (
      <>
        <Button className="purchase-unavailable" disabled>
          <LockKeyhole aria-hidden="true" /> Paid checkout coming soon
        </Button>
        <p className="purchase-note">
          No payment will be taken yet. After paying, you’ll get a download link by email that works for{" "}
          {PAID_LINK_HOURS} hours.
        </p>
      </>
    );

  return (
    <>
      <GetByEmailForm guideId={guideId} defaultName={displayNameOf(user)} defaultEmail={user?.email ?? ""} />
      {entitlement && (
        <p className="purchase-note">
          <span>
            Already yours —{" "}
            <button type="button" className="link-button" disabled={busy} onClick={() => void doDownload()}>
              download now
            </button>{" "}
            or open <Link to="/library">your library</Link>.
          </span>
        </p>
      )}
      {msg && <p className="purchase-note" role="status">{msg}</p>}
    </>
  );
}

function displayNameOf(user: { user_metadata?: Record<string, unknown> } | null) {
  const meta = user?.user_metadata ?? {};
  const name = meta["full_name"] ?? meta["name"] ?? meta["display_name"];
  return typeof name === "string" ? name : "";
}

function GetByEmailForm({ guideId, defaultName, defaultEmail }: { guideId: string; defaultName: string; defaultEmail: string }) {
  const request = useServerFn(requestResourceByEmail);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    setName((n) => n || defaultName);
    setEmail((e) => e || defaultEmail);
  }, [defaultName, defaultEmail]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await request({ data: { guideId, name, email, website } });
      if (result.ok) setSentTo(result.email);
      else setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  if (sentTo)
    return (
      <div className="get-sent" role="status">
        <MailCheck aria-hidden="true" />
        <div>
          <strong>Check your inbox</strong>
          <p>
            We emailed your download link to {sentTo}. It can take a minute — check your spam folder too.
          </p>
          <button type="button" className="link-button" onClick={() => setSentTo("")}>
            Use a different email
          </button>
        </div>
      </div>
    );

  return (
    <form className="get-form" onSubmit={(e) => void submit(e)} noValidate>
      <label>
        Your name
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" required />
      </label>
      <label>
        Email
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
          autoComplete="email"
          required
        />
      </label>
      <input
        className="get-form-trap"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
      />
      <Button type="submit" disabled={busy || !name.trim() || !email.trim()}>
        <Mail aria-hidden="true" /> {busy ? "Sending…" : "Email me the download link"}
      </Button>
      {error && <p className="get-form-error" role="alert">{error}</p>}
      <p className="purchase-note">Free. We’ll email you a personal link to download the file.</p>
    </form>
  );
}
