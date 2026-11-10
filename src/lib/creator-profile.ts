/** Browser-safe rules for expert profiles and verification labels. */

export const VERIFICATION_KINDS = ["identity", "experience", "qualification"] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

export const VERIFICATION_LABELS: Record<VerificationKind, string> = {
  identity: "Identity verified",
  experience: "Experience verified",
  qualification: "Qualifications verified",
};

export const VERIFICATION_HINTS: Record<VerificationKind, string> = {
  identity: "Doerly checked this creator is who they say they are.",
  experience: "Doerly checked evidence of the experience described.",
  qualification: "Doerly checked the qualifications listed.",
};

/** "a, b , ,c" → ["a","b","c"], max 10 items of 40 chars, no duplicates (case-insensitive). */
export function parseSpecializations(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const v = raw.trim().slice(0, 40);
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

/** Years of experience: blank → null, otherwise a whole number 0–80; anything else is invalid. */
export function parseYearsExperience(input: string): { ok: true; value: number | null } | { ok: false } {
  const t = input.trim();
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 80) return { ok: false };
  return { ok: true, value: n };
}
