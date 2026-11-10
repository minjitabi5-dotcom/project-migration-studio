import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadFromLink, getDownloadLinkInfo } from "@/lib/resource-delivery.functions";
import { TOKEN_PATTERN } from "@/lib/download-links";
import { downloadItemFromLink, getLinkContents, type LinkContentItem } from "@/lib/product-content.functions";
import { PlaybookContent } from "@/components/playbook/playbook-content";

export const Route = createFileRoute("/get/$token")({
  loader: ({ params }) =>
    TOKEN_PATTERN.test(params.token)
      ? getDownloadLinkInfo({ data: { token: params.token } })
      : Promise.resolve({ status: "not_found" as const, title: null, slug: null }),
  head: () => ({
    meta: [
      { title: "Your download | Doerly" },
      { name: "description", content: "Download the resource you requested on Doerly." },
      { property: "og:title", content: "Your download | Doerly" },
      { property: "og:description", content: "Download the resource you requested on Doerly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DownloadPage,
});

function formatExpiry(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function DownloadPage() {
  const info = Route.useLoaderData();
  const { token } = Route.useParams();
  const download = useServerFn(downloadFromLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fetchContents = useServerFn(getLinkContents);
  const downloadItem = useServerFn(downloadItemFromLink);
  const [contents, setContents] = useState<{ hasMainFile: boolean; items: LinkContentItem[] } | null>(null);

  useEffect(() => {
    if (info.status !== "ok") return;
    let active = true;
    void fetchContents({ data: { token } })
      .then((c) => active && setContents(c))
      .catch(() => active && setContents({ hasMainFile: true, items: [] }));
    return () => {
      active = false;
    };
  }, [info.status, token, fetchContents]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await download({ data: { token } });
      if ("url" in result) window.location.assign(result.url);
      else setError(result.error);
    } catch {
      setError("We couldn’t start the download. Please try again.");
    }
    setBusy(false);
  }

  const backLink = info.slug ? (
    <Button asChild variant="outline">
      <Link to="/guide/$slug" params={{ slug: info.slug }}>
        Request a new link
      </Link>
    </Button>
  ) : (
    <Button asChild variant="outline">
      <Link to="/explore" search={{}}>
        Browse resources
      </Link>
    </Button>
  );

  if (info.status !== "ok") {
    const heading =
      info.status === "expired"
        ? "This download link has expired"
        : info.status === "limit"
          ? "This link has been used up"
          : "We couldn’t find this download";
    const body =
      info.status === "not_found"
        ? "The link may be incomplete. Open it again from your email, or request a new one."
        : `${info.title ? `“${info.title}” ` : "This resource "}needs a fresh link. Request a new one from the product page.`;
    return (
      <main className="get-page">
        <p className="eyebrow">Your download</p>
        <h1>{heading}</h1>
        <p>{body}</p>
        <div className="button-row">{backLink}</div>
      </main>
    );
  }

  return (
    <main className="get-page">
      <p className="eyebrow">Your download</p>
      <h1>{info.title}</h1>
      <p>
        {info.expiresAt
          ? `This link works until ${formatExpiry(info.expiresAt)}.`
          : "You can come back to this link from your email to download it again."}
      </p>
      {(!contents || contents.hasMainFile) && (
        <div className="button-row">
          <Button disabled={busy} onClick={() => void start()}>
            <Download aria-hidden="true" /> {busy ? "Preparing…" : contents?.items.length ? "Download the main file" : "Download"}
          </Button>
        </div>
      )}
      {contents && contents.items.length > 0 && (
        <div className="get-contents">
          <h2>Everything in this product</h2>
          <PlaybookContent
            items={contents.items}
            onDownload={async (itemId) => {
              const r = await downloadItem({ data: { token, itemId } });
              if ("url" in r) window.location.assign(r.url);
              else return r.error;
            }}
          />
        </div>
      )}
      {error && (
        <p className="get-form-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
