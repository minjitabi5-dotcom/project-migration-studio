import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanOutlineInput, OUTLINE_DESCRIPTION_MIN_CHARS, type OutlineInput } from "./playbook-outline";
import { draftPlaybookOutline, type OutlineResult } from "./playbook-outline.server";

/**
 * Drafts a sectioned playbook outline from the creator's description, audience and goals.
 * Nothing is saved here — the creator reviews the outline and adds it to the playbook themselves.
 */
export const generatePlaybookOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string } & Partial<OutlineInput>) => {
    if (typeof input?.versionId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.versionId)) {
      throw new Error("Invalid request.");
    }
    const fields = cleanOutlineInput(input);
    if (fields.description.length < OUTLINE_DESCRIPTION_MIN_CHARS) {
      throw new Error(`Describe the product in at least ${OUTLINE_DESCRIPTION_MIN_CHARS} characters.`);
    }
    return { versionId: input.versionId, ...fields };
  })
  .handler(async ({ data, context }): Promise<OutlineResult> => {
    const { supabase, userId } = context;
    const { data: version, error } = await supabase
      .from("guide_versions")
      .select("id, state")
      .eq("id", data.versionId)
      .eq("creator_id", userId)
      .maybeSingle();
    if (error) return { ok: false, error: "We couldn’t load this product. Please try again." };
    if (!version) return { ok: false, error: "You can only plan outlines for your own products." };
    if (version.state !== "draft" && version.state !== "changes_requested") {
      return { ok: false, error: "Start editing this product before planning its outline." };
    }
    const { versionId: _v, ...input } = data;
    return draftPlaybookOutline(input);
  });
