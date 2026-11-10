import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VERIFICATION_HINTS, VERIFICATION_LABELS, type VerificationKind } from "@/lib/creator-profile";

type Label = { kind: string; note: string };

export function VerificationBadges({ labels }: { labels: Label[] }) {
  if (!labels.length) return null;
  return (
    <ul className="verify-badges" aria-label="Verified by Doerly">
      {labels.map((l) => (
        <li key={l.kind} title={l.note || VERIFICATION_HINTS[l.kind as VerificationKind]}>
          <BadgeCheck aria-hidden="true" /> {VERIFICATION_LABELS[l.kind as VerificationKind] ?? l.kind}
        </li>
      ))}
    </ul>
  );
}

/** Creator verification labels + link to the public creator page. */
export function CreatorCredentials({ creatorId, creatorName }: { creatorId: string; creatorName: string }) {
  const [labels, setLabels] = useState<Label[]>([]);
  useEffect(() => {
    let active = true;
    void supabase
      .from("creator_verifications")
      .select("kind, note")
      .eq("creator_id", creatorId)
      .then(({ data }) => {
        if (active) setLabels(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [creatorId]);

  return (
    <div className="creator-credentials">
      <VerificationBadges labels={labels} />
      <Link to="/creators/$creatorId" params={{ creatorId }} className="creator-profile-link">
        <UserRound aria-hidden="true" /> See {creatorName.split(" ")[0]}’s full profile
      </Link>
    </div>
  );
}
