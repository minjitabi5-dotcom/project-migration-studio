import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Bookmark, ChevronDown, ChevronUp, Download, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MarketplaceAuthDialog } from "@/components/marketplace-auth-dialog";
import { useDownload } from "@/components/guide-access";
import { useMarketplaceAuth } from "@/hooks/use-marketplace-auth";
import { supabase } from "@/integrations/supabase/client";
import { getResourceItemDownload } from "@/lib/product-content.functions";
import { PlaybookContent, type ContentItem } from "@/components/playbook/playbook-content";
import {
  CollectionPicker,
  LibraryNotesProgress,
  NewCollectionForm,
  saveItemProgress,
  useCollections,
} from "@/components/library/library-panel";
import { categoryToneClass } from "@/lib/category-colors";
import { formatGuidePrice } from "@/lib/marketplace-data";

type Owned = {
  id: string;
  created_at: string;
  version_id: string;
  guide_id: string;
  guides: {
    slug: string;
    title: string;
    format: string;
    category: string;
    published_version_id: string | null;
    live_updated_at: string | null;
  } | null;
};

type Saved = {
  guide_id: string;
  created_at: string;
  guides: { slug: string; title: string; format: string; category: string; summary: string; price_cents: number; currency_code: string } | null;
};

type Progress = { guide_id: string; percent: number };

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "My library | Doerly" },
      { name: "description", content: "Your resources, saved products, notes, progress and collections on Doerly." },
      { property: "og:title", content: "My library | Doerly" },
      { property: "og:description", content: "Your resources, saved products, notes, progress and collections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { user, ready } = useMarketplaceAuth();
  const [owned, setOwned] = useState<Owned[] | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const { collections, membership, reload: reloadCollections } = useCollections(user?.id);

  const load = useCallback(async () => {
    if (!user) return;
    // Resources requested by email before signing up join the library once the email is verified.
    await supabase.rpc("attach_my_email_orders");
    const [o, s, p] = await Promise.all([
      supabase
        .from("entitlements")
        .select("id, created_at, version_id, guide_id, guides(slug, title, format, category, published_version_id, live_updated_at)")
        .eq("buyer_id", user.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("saved_products")
        .select("guide_id, created_at, guides(slug, title, format, category, summary, price_cents, currency_code)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("library_progress").select("guide_id, percent").eq("user_id", user.id),
    ]);
    if (o.error) toast.error(o.error.message);
    // Keep the newest entitlement per product.
    const seen = new Set<string>();
    setOwned(((o.data as Owned[] | null) ?? []).filter((e) => (seen.has(e.guide_id) ? false : (seen.add(e.guide_id), true))));
    setSaved((s.data as Saved[] | null) ?? []);
    setProgress(Object.fromEntries(((p.data as Progress[] | null) ?? []).map((r) => [r.guide_id, r.percent])));
  }, [user]);
  useEffect(() => void load(), [load]);

  const inFilter = useCallback(
    (guideId: string) => filter === "all" || filter === "saved" || (membership[guideId]?.has(filter) ?? false),
    [filter, membership],
  );
  const shownOwned = useMemo(() => (filter === "saved" ? [] : (owned ?? []).filter((o) => inFilter(o.guide_id))), [owned, filter, inFilter]);
  const ownedIds = new Set((owned ?? []).map((o) => o.guide_id));
  const shownSaved = saved.filter((s) => !ownedIds.has(s.guide_id) && (filter === "all" || filter === "saved" || inFilter(s.guide_id)));

  if (!ready) return <main className="market-message"><LoaderCircle className="animate-spin" /></main>;
  if (!user)
    return (
      <main className="market-message">
        <h1>Your library</h1>
        <p>Sign in to see your resources, saved products, notes and collections.</p>
        <Button onClick={() => setAuthOpen(true)}>Sign in</Button>
        <MarketplaceAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      </main>
    );

  return (
    <main className="app-page library-page">
      <div>
        <p className="eyebrow">Library</p>
        <h1>My knowledge library</h1>
        <p className="app-muted">Everything you’ve got, saved and organised — with your notes and progress.</p>
      </div>

      <div className="library-filters">
        <div className="category-list" role="tablist" aria-label="Library view">
          {[
            ["all", "Everything"],
            ["saved", "Saved"],
            ...collections.map((c) => [c.id, c.name] as const),
          ].map(([value, label]) => (
            <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </Button>
          ))}
        </div>
        <NewCollectionForm userId={user.id} onCreated={() => void reloadCollections()} />
      </div>

      {!owned ? (
        <LoaderCircle className="animate-spin" />
      ) : (
        <>
          {filter !== "saved" && (
            <section className="library-list" aria-label="Your resources">
              <h2>Your resources</h2>
              {shownOwned.length === 0 ? (
                <div className="app-card">
                  <p>{owned.length ? "Nothing in this collection yet." : "You haven’t got any resources yet."}</p>
                  <Button asChild variant="outline"><Link to="/explore" search={{}}>Explore resources</Link></Button>
                </div>
              ) : (
                shownOwned.map((item) => (
                  <OwnedRow
                    key={item.id}
                    item={item}
                    userId={user.id}
                    percent={progress[item.guide_id] ?? 0}
                    expanded={open === item.id}
                    onToggle={() => setOpen((o) => (o === item.id ? null : item.id))}
                    collections={collections}
                    memberOf={membership[item.guide_id] ?? new Set()}
                    onCollectionsChanged={() => void reloadCollections()}
                    onProgress={(p) => setProgress((cur) => ({ ...cur, [item.guide_id]: p }))}
                  />
                ))
              )}
            </section>
          )}

          <section className="library-list" aria-label="Saved for later">
            <h2>
              <Bookmark aria-hidden="true" /> Saved for later
            </h2>
            {shownSaved.length === 0 ? (
              <p className="app-muted">Use “Save for later” on any product page to keep it here.</p>
            ) : (
              shownSaved.map((s) => (
                <article key={s.guide_id} className="library-row">
                  <div className="library-row-main">
                    <p className="guide-meta">
                      <span className={categoryToneClass(s.guides?.category ?? "")}>{s.guides?.category}</span>
                      <span>{s.guides?.format}</span>
                    </p>
                    <h3>{s.guides?.title ?? "Product"}</h3>
                    {s.guides?.summary && <p className="app-muted">{s.guides.summary}</p>}
                    <CollectionPicker
                      userId={user.id}
                      guideId={s.guide_id}
                      collections={collections}
                      memberOf={membership[s.guide_id] ?? new Set()}
                      onChanged={() => void reloadCollections()}
                    />
                  </div>
                  <div className="library-row-actions">
                    {s.guides && (
                      <Button asChild size="sm">
                        <Link to="/guide/$slug" params={{ slug: s.guides.slug }}>
                          {s.guides.price_cents === 0 ? "Get it free" : formatGuidePrice(s.guides.price_cents, s.guides.currency_code)}
                        </Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await supabase.from("saved_products").delete().eq("user_id", user.id).eq("guide_id", s.guide_id);
                        void load();
                      }}
                    >
                      <Trash2 aria-hidden="true" /> Remove
                    </Button>
                  </div>
                </article>
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}

function OwnedRow({
  item,
  userId,
  percent,
  expanded,
  onToggle,
  collections,
  memberOf,
  onCollectionsChanged,
  onProgress,
}: {
  item: Owned;
  userId: string;
  percent: number;
  expanded: boolean;
  onToggle: () => void;
  collections: { id: string; name: string }[];
  memberOf: Set<string>;
  onCollectionsChanged: () => void;
  onProgress: (percent: number) => void;
}) {
  const download = useDownload();
  const updated = Boolean(item.guides?.published_version_id && item.guides.published_version_id !== item.version_id);
  return (
    <article className={`library-row ${expanded ? "is-open" : ""}`}>
      <div className="library-row-main">
        <p className="guide-meta">
          <span className={categoryToneClass(item.guides?.category ?? "")}>{item.guides?.category}</span>
          <span>{item.guides?.format}</span>
          <span>added {new Date(item.created_at).toLocaleDateString()}</span>
        </p>
        <h3>{item.guides?.title ?? "Resource"}</h3>
        <div className="library-mini-progress" aria-label={`${percent}% complete`}>
          <span className="qc-bar" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
          <small>{percent}%</small>
        </div>
        {updated && item.guides && (
          <p className="library-update">
            <BellRing aria-hidden="true" /> The creator updated this product since you got it.{" "}
            <Link to="/guide/$slug" params={{ slug: item.guides.slug }}>Get the latest version</Link>
          </p>
        )}
      </div>
      <div className="library-row-actions">
        <Button size="sm" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />} {expanded ? "Close" : "Open"}
        </Button>
        {item.guides && (
          <Button asChild size="sm" variant="outline">
            <Link to="/guide/$slug" params={{ slug: item.guides.slug }}>View listing</Link>
          </Button>
        )}
      </div>
      {expanded && (
        <OwnedDetail
          item={item}
          userId={userId}
          onDownloadMain={() => download(item.id)}
          collections={collections}
          memberOf={memberOf}
          onCollectionsChanged={onCollectionsChanged}
          onProgress={onProgress}
        />
      )}
    </article>
  );
}

function OwnedDetail({
  item,
  userId,
  onDownloadMain,
  collections,
  memberOf,
  onCollectionsChanged,
  onProgress,
}: {
  item: Owned;
  userId: string;
  onDownloadMain: () => Promise<void>;
  collections: { id: string; name: string }[];
  memberOf: Set<string>;
  onCollectionsChanged: () => void;
  onProgress: (percent: number) => void;
}) {
  const downloadItem = useServerFn(getResourceItemDownload);
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [hasMain, setHasMain] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from("guide_versions").select("file_path, file_name").eq("id", item.version_id).maybeSingle(),
      supabase
        .from("product_items")
        .select("id, section, position, kind, title, description, file_name, url, tool_key, tool_config")
        .eq("version_id", item.version_id)
        .order("position"),
    ]).then(([v, i]) => {
      if (!active) return;
      setHasMain(Boolean(v.data?.file_path));
      setItems((i.data as ContentItem[] | null) ?? []);
    });
    return () => {
      active = false;
    };
  }, [item.version_id]);

  const itemIds = (items ?? []).map((i) => i.id);

  async function toggleDone(id: string) {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    const { error } = await saveItemProgress(userId, item.guide_id, next, itemIds);
    if (error) toast.error(error.message);
    onProgress(itemIds.length ? Math.round((itemIds.filter((x) => next.has(x)).length / itemIds.length) * 100) : 0);
  }

  return (
    <div className="library-detail">
      {items === null ? (
        <LoaderCircle className="animate-spin" />
      ) : (
        <>
          {hasMain && (
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDownloadMain();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Download failed.");
                }
                setBusy(false);
              }}
            >
              <Download aria-hidden="true" /> Download the main file
            </Button>
          )}
          <PlaybookContent
            items={items}
            done={done}
            onToggleDone={(id) => void toggleDone(id)}
            onDownload={async (itemId) => {
              const r = await downloadItem({ data: { entitlementId: item.id, itemId } });
              if ("url" in r) {
                window.location.assign(r.url);
                return undefined;
              }
              return r.error;
            }}
          />
        </>
      )}
      <div className="library-detail-side">
        <LibraryNotesProgress userId={userId} guideId={item.guide_id} itemIds={itemIds} done={done} onDoneChange={setDone} />
        <div className="studio-field">
          <span>Collections</span>
          <CollectionPicker userId={userId} guideId={item.guide_id} collections={collections} memberOf={memberOf} onChanged={onCollectionsChanged} />
        </div>
      </div>
    </div>
  );
}
