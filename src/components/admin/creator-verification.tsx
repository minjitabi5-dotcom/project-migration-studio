import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { VERIFICATION_KINDS, VERIFICATION_LABELS, type VerificationKind } from "@/lib/creator-profile";
import { parseCreatorProfile } from "@/lib/marketplace-data";

type Creator = {
  id: string;
  display_name: string;
  bio: string;
  professional_background: string;
  years_experience: number | null;
  qualifications: string;
};
type Label = { id: string; creator_id: string; kind: string; note: string };

/** Admin: grant or remove identity, experience and qualification labels on creator profiles. */
export function CreatorVerificationAdmin() {
  const [creators, setCreators] = useState<Creator[] | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const { data: guides } = await supabase.from("guides").select("creator_id");
    const ids = [...new Set((guides ?? []).map((g) => g.creator_id))];
    const [p, l] = await Promise.all([
      ids.length
        ? supabase
            .from("profiles")
            .select("id, display_name, bio, professional_background, years_experience, qualifications")
            .in("id", ids)
            .order("display_name")
        : Promise.resolve({ data: [] as Creator[] }),
      supabase.from("creator_verifications").select("id, creator_id, kind, note"),
    ]);
    setCreators((p.data as Creator[] | null) ?? []);
    setLabels(l.data ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  async function grant(creatorId: string, kind: VerificationKind) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    setBusy(true);
    const { error } = await supabase.from("creator_verifications").insert({
      creator_id: creatorId,
      kind,
      note: (notes[`${creatorId}:${kind}`] ?? "").trim().slice(0, 300),
      verified_by: auth.user.id,
    });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(`${VERIFICATION_LABELS[kind]} added.`);
    void load();
  }

  async function revoke(label: Label) {
    if (!window.confirm(`Remove “${VERIFICATION_LABELS[label.kind as VerificationKind]}”?`)) return;
    setBusy(true);
    const { error } = await supabase.from("creator_verifications").delete().eq("id", label.id);
    setBusy(false);
    if (error) return void toast.error(error.message);
    void load();
  }

  if (!creators) return <LoaderCircle className="animate-spin" />;
  const shown = creators.filter((c) => c.display_name.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="app-grid" aria-label="Creator verification">
      <p className="app-muted">
        Grant a label only after checking evidence. Labels appear on the creator’s products and public profile.
      </p>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a creator" className="max-w-sm" />
      {shown.length === 0 && <p className="app-muted">No creators yet.</p>}
      {shown.map((c) => {
        const mine = labels.filter((l) => l.creator_id === c.id);
        const bio = parseCreatorProfile(c.bio);
        return (
          <article key={c.id} className="app-card">
            <div className="dash-section-head">
              <h3>{c.display_name}</h3>
              <Link to="/creators/$creatorId" params={{ creatorId: c.id }} className="link-button">
                Public profile
              </Link>
            </div>
            <p className="app-muted">
              {c.years_experience !== null ? `${c.years_experience} years · ` : ""}
              {bio.experience || c.professional_background || "No background written yet."}
            </p>
            {c.qualifications && <p className="app-muted">Qualifications: {c.qualifications}</p>}
            <div className="verify-admin-grid">
              {VERIFICATION_KINDS.map((kind) => {
                const has = mine.find((l) => l.kind === kind);
                return (
                  <div key={kind} className="verify-admin-cell">
                    <strong>
                      <BadgeCheck aria-hidden="true" className={has ? "is-on" : ""} /> {VERIFICATION_LABELS[kind]}
                    </strong>
                    {has ? (
                      <>
                        {has.note && <small>{has.note}</small>}
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revoke(has)}>
                          <X aria-hidden="true" /> Remove
                        </Button>
                      </>
                    ) : (
                      <>
                        <Input
                          value={notes[`${c.id}:${kind}`] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [`${c.id}:${kind}`]: e.target.value }))}
                          maxLength={300}
                          placeholder="What you checked (shown on hover)"
                        />
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void grant(c.id, kind)}>
                          Grant
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
}
