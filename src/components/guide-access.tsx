import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpenCheck, Download, Library, LoaderCircle, LockKeyhole, Mail, MailCheck } from "lucide-react";
import { MarketplaceAuthDialog } from "@/components/marketplace-auth-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMarketplaceAuth } from "@/hooks/use-marketplace-auth";
import { supabase } from "@/integrations/supabase/client";
import { getResourceDownload } from "@/lib/resource-access.functions";
import { requestResourceByEmail } from "@/lib/resource-delivery.functions";
import { PAID_LINK_HOURS } from "@/lib/download-links";

type Entitlement = { id: string; version_id: string; guide_id: string };

/** Lets every panel on the page (access, reviews, library tools) refresh after a product is added. */
const ENTITLEMENT_EVENT = "doerly:entitlement-changed";
export function announceEntitlementChange() {
  window.dispatchEvent(new Event(ENTITLEMENT_EVENT));
}

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
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener(ENTITLEMENT_EVENT, onChange);
    return () => window.removeEventListener(ENTITLEMENT_EVENT, onChange);
  }, [refresh]);
  return { user, ready, entitlement, refresh };
}

export function GuideAccessPanel({ guideId, priceCents, isSample }: { guideId: string; priceCents: number; isSample: boolean }) {
  const { user, ready, entitlement } = useEntitlement(guideId);
  const download = useDownload();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [hasFile, setHasFile] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  // Playbooks may have no single main file; only offer "Download" when there is one.
  useEffect(() => {
    if (!entitlement) return setHasFile(false);
    void supabase
      .from("guide_versions")
      .select("file_name")
      .eq("id", entitlement.version_id)
      .maybeSingle()
      .then(({ data }) => setHasFile(Boolean(data?.file_name)));
  }, [entitlement]);

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

  async function addToLibrary() {
    setBusy(true);
    setMsg("");
    const { error } = await supabase.rpc("claim_free_resource", { p_guide_id: guideId });
    setBusy(false);
    if (error) return setMsg(error.message);
    announceEntitlementChange();
  }

  function openAuth(mode: "signin" | "signup") {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  if (isSample)
    return (
      <Button className="purchase-unavailable" disabled>
        <LockKeyhole aria-hidden="true" /> Example listing
      </Button>
    );

  const authDialog = (
    <MarketplaceAuthDialog key={authMode} open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} />
  );

  if (entitlement)
    return (
      <div className="access-owned" role="status">
        <p className="access-owned-title">
          <BookOpenCheck aria-hidden="true" /> In your library
        </p>
        <div className="access-owned-actions">
          {hasFile && (
            <Button disabled={busy} onClick={() => void doDownload()}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Download aria-hidden="true" />} Download
            </Button>
          )}
          <Button asChild variant={hasFile ? "outline" : "default"}>
            <Link to="/library">
              <Library aria-hidden="true" /> Open my library
            </Link>
          </Button>
        </div>
        <p className="purchase-note">You can now leave a verified review below.</p>
        {msg && <p className="purchase-note" role="alert">{msg}</p>}
      </div>
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
        {!user && ready && (
          <Button variant="outline" onClick={() => openAuth("signin")}>
            Sign in to save it for later
          </Button>
        )}
        {authDialog}
      </>
    );

  if (user)
    return (
      <>
        <Button className="access-get" disabled={busy} onClick={() => void addToLibrary()}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Library aria-hidden="true" />} Get it free — add to my library
        </Button>
        <p className="purchase-note">Free. It’s saved to your account so you can open it any time and review it.</p>
        {msg && <p className="get-form-error" role="alert">{msg}</p>}
      </>
    );

  return (
    <>
      <Button className="access-get" disabled={!ready} onClick={() => openAuth("signup")}>
        <Library aria-hidden="true" /> Get it free with an account
      </Button>
      <p className="purchase-note">
        <span>
          Already have an account?{" "}
          <button type="button" className="link-button" onClick={() => openAuth("signin")}>
            Sign in
          </button>
          . Your account keeps it in your library and lets you leave a verified review.
        </span>
      </p>
      {showEmail ? (
        <GetByEmailForm guideId={guideId} defaultName="" defaultEmail="" />
      ) : (
        <button type="button" className="link-button access-email-toggle" onClick={() => setShowEmail(true)}>
          <Mail aria-hidden="true" /> Or get a download link by email instead
        </button>
      )}
      {authDialog}
    </>
  );
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
