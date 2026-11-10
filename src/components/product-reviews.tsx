import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Flag, LoaderCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarketplaceAuthDialog } from "@/components/marketplace-auth-dialog";
import { useEntitlement } from "@/components/guide-access";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { reviewOverall, ratingBreakdown } from "@/lib/reviews";

type Review = Tables<"resource_feedback">;
type Scores = { usefulness: number; clarity: number; listing_accuracy: number };

const SCORE_LABELS: Record<keyof Scores, string> = {
  usefulness: "Useful",
  clarity: "Clear",
  listing_accuracy: "Matches the listing",
};

const CASE_TYPES = [
  ["listing_mismatch", "Listing doesn’t match the file"],
  ["corrupted_file", "File is broken or corrupted"],
  ["wrong_file", "Wrong file delivered"],
  ["access_failure", "I can’t access it"],
  ["unsafe_content", "Unsafe or harmful content"],
  ["rights_infringement", "Copyright / rights concern"],
  ["other", "Something else"],
] as const;

export function Stars({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  const rounded = Math.round(value);
  return (
    <span className={`review-stars is-${size}`} aria-label={`${value.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={n <= rounded ? "is-on" : ""} />
      ))}
    </span>
  );
}

function StarInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="star-input" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      <div>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className={n <= value ? "is-on" : ""}
            onClick={() => onChange(n)}
          >
            <Star aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Verified-buyer reviews on the product details page, with the review form and problem reports. */
export function ProductReviews({ guideId, creatorId }: { guideId: string; creatorId: string }) {
  const { user, entitlement, refresh } = useEntitlement(guideId);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [authOpen, setAuthOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [scores, setScores] = useState<Scores>({ usefulness: 5, clarity: 5, listing_accuracy: 5 });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [caseType, setCaseType] = useState<string>("listing_mismatch");
  const [details, setDetails] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("resource_feedback")
      .select("*")
      .eq("guide_id", guideId)
      .eq("status", "visible")
      .order("created_at", { ascending: false });
    const rows = data ?? [];
    setReviews(rows);
    const ids = [...new Set(rows.map((r) => r.buyer_id))];
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      setNames(Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name])));
    }
  }, [guideId]);
  useEffect(() => void load(), [load]);

  // Resources requested by email join the account once its email is verified.
  useEffect(() => {
    if (!user || entitlement) return;
    void supabase.rpc("attach_my_email_orders").then(({ data }) => {
      if (data && data > 0) void refresh();
    });
  }, [user, entitlement, refresh]);

  const mine = user ? reviews?.find((r) => r.buyer_id === user.id) : undefined;
  const isCreator = user?.id === creatorId;

  function startWriting() {
    if (mine) {
      setScores({ usefulness: mine.usefulness, clarity: mine.clarity, listing_accuracy: mine.listing_accuracy });
      setComment(mine.comment);
    }
    setWriting(true);
  }

  async function submit() {
    if (!user || !entitlement) return;
    setBusy(true);
    const { error } = mine
      ? await supabase.from("resource_feedback").update({ ...scores, comment: comment.trim() }).eq("id", mine.id)
      : await supabase.from("resource_feedback").insert({
          buyer_id: user.id,
          guide_id: guideId,
          version_id: entitlement.version_id,
          entitlement_id: entitlement.id,
          ...scores,
          comment: comment.trim(),
        });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(mine ? "Review updated." : "Thanks for your review!");
    setWriting(false);
    setComment("");
    void load();
  }

  async function report() {
    if (!user) return setAuthOpen(true);
    const { error } = await supabase.from("support_cases").insert({ reporter_id: user.id, case_type: caseType, guide_id: guideId, details });
    if (error) return void toast.error(error.message.includes("check") ? "Please add at least 10 characters of detail." : error.message);
    setDetails("");
    setReportOpen(false);
    toast.success("Thanks — our team will look into it.");
  }

  const list = reviews ?? [];
  const overall = list.length ? list.reduce((s, r) => s + reviewOverall(r), 0) / list.length : 0;
  const breakdown = ratingBreakdown(list);
  const avg = (k: keyof Scores) => (list.length ? (list.reduce((s, r) => s + r[k], 0) / list.length).toFixed(1) : "–");
  const shown = showAll ? list : list.slice(0, 5);

  return (
    <section className="reviews-section" aria-label="Reviews" id="reviews">
      <div className="reviews-head">
        <h2>Reviews</h2>
        {reviews === null ? (
          <LoaderCircle className="animate-spin" aria-label="Loading reviews" />
        ) : list.length > 0 ? (
          <div className="reviews-summary">
            <div className="reviews-score">
              <strong>{overall.toFixed(1)}</strong>
              <Stars value={overall} />
              <span>
                {list.length} review{list.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="reviews-breakdown" aria-label="Rating breakdown">
              {breakdown.map((b) => (
                <li key={b.stars}>
                  <span>{b.stars}★</span>
                  <span className="qc-bar" aria-hidden="true">
                    <span style={{ width: `${list.length ? (b.count / list.length) * 100 : 0}%` }} />
                  </span>
                  <small>{b.count}</small>
                </li>
              ))}
            </ul>
            <p className="reviews-dims">
              {(Object.keys(SCORE_LABELS) as (keyof Scores)[]).map((k) => (
                <span key={k}>
                  {SCORE_LABELS[k]} <strong>{avg(k)}</strong>
                </span>
              ))}
            </p>
          </div>
        ) : (
          <p className="app-muted">No reviews yet — be the first once you’ve used it.</p>
        )}
      </div>

      {!isCreator && (
        <div className="reviews-cta">
          {!user ? (
            <>
              <p className="app-muted">Got this product? Sign in with the same email to leave a review.</p>
              <Button variant="outline" onClick={() => setAuthOpen(true)}>
                Sign in to review
              </Button>
            </>
          ) : entitlement ? (
            !writing && (
              <Button variant="outline" onClick={startWriting}>
                <Star aria-hidden="true" /> {mine ? "Edit your review" : "Write a review"}
              </Button>
            )
          ) : (
            <p className="app-muted">Only people who got this product can review it. Get it above, then come back.</p>
          )}
        </div>
      )}

      {writing && entitlement && (
        <div className="review-form">
          {(Object.keys(SCORE_LABELS) as (keyof Scores)[]).map((k) => (
            <StarInput key={k} label={SCORE_LABELS[k]} value={scores[k]} onChange={(n) => setScores((s) => ({ ...s, [k]: n }))} />
          ))}
          <Textarea
            maxLength={1000}
            rows={4}
            placeholder="What worked, what didn’t, and who would you recommend it to? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="product-form-actions">
            <Button variant="ghost" onClick={() => setWriting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" />} {mine ? "Save review" : "Post review"}
            </Button>
          </div>
        </div>
      )}

      {list.length > 0 && (
        <ul className="review-list">
          {shown.map((r) => (
            <li key={r.id} className="review-item">
              <div className="review-head">
                <Stars value={reviewOverall(r)} size="sm" />
                <strong>{names[r.buyer_id] && names[r.buyer_id] !== "New member" ? names[r.buyer_id] : "Doerly member"}</strong>
                <span className="review-verified">
                  <BadgeCheck aria-hidden="true" /> Verified buyer
                </span>
              </div>
              <p className="review-dims">
                Useful {r.usefulness}/5 · Clear {r.clarity}/5 · Matches listing {r.listing_accuracy}/5
              </p>
              {r.comment && <p>{r.comment}</p>}
              <small>{new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</small>
            </li>
          ))}
        </ul>
      )}
      {list.length > 5 && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer reviews" : `Show all ${list.length} reviews`}
        </Button>
      )}

      <div>
        <Button variant="ghost" size="sm" onClick={() => (user ? setReportOpen((v) => !v) : setAuthOpen(true))}>
          <Flag aria-hidden="true" /> Report a problem
        </Button>
      </div>
      {reportOpen && (
        <div className="app-card">
          <select className="app-select" value={caseType} onChange={(e) => setCaseType(e.target.value)}>
            {CASE_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Textarea placeholder="Describe the problem (at least 10 characters)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <Button size="sm" onClick={() => void report()}>
            Send report
          </Button>
        </div>
      )}
      <MarketplaceAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </section>
  );
}
