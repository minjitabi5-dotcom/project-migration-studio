import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TOKEN_PATTERN } from "./download-links";
import { emailCreatorFirstDownload, hashLinkToken } from "./download-links.server";
import { siteOrigin } from "./site-origin.server";

const LINK_SECONDS = 60;
const uuid = z.string().uuid();

/**
 * Free attachment a creator added to a live product: anyone can download it straight
 * from the product page. Only attachments on published products are signed.
 */
export const getFreeAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: { guideId: string }) => ({ guideId: uuid.parse(input?.guideId) }))
  .handler(async ({ data }): Promise<{ url: string } | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: guide } = await supabaseAdmin
      .from("guides")
      .select("status, published_version_id, free_attachment_path, free_attachment_name")
      .eq("id", data.guideId)
      .maybeSingle();
    if (!guide || guide.status !== "published" || !guide.published_version_id || !guide.free_attachment_path) {
      return { error: "This free download isn’t available." };
    }
    const { data: signed, error } = await supabaseAdmin.storage
      .from("creator-guides")
      .createSignedUrl(guide.free_attachment_path, LINK_SECONDS, {
        download: guide.free_attachment_name ?? true,
      });
    if (error || !signed) return { error: "We couldn’t prepare the file. Please try again." };
    return { url: signed.signedUrl };
  });

/** A file inside a playbook the signed-in caller holds. */
export const getResourceItemDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entitlementId: string; itemId: string }) => ({
    entitlementId: uuid.parse(input?.entitlementId),
    itemId: uuid.parse(input?.itemId),
  }))
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    const { supabase, userId } = context;
    const { data: ent } = await supabase
      .from("entitlements")
      .select("id, guide_id, version_id, revoked_at")
      .eq("id", data.entitlementId)
      .eq("buyer_id", userId)
      .maybeSingle();
    if (!ent || ent.revoked_at) return { error: "You don’t have access to this resource." };
    // Row rules only return items of versions the caller holds.
    const { data: item } = await supabase
      .from("product_items")
      .select("file_path, file_name, kind, version_id")
      .eq("id", data.itemId)
      .eq("version_id", ent.version_id)
      .maybeSingle();
    if (!item || item.kind !== "file" || !item.file_path) return { error: "This file isn’t available." };

    await supabase.from("access_events").insert({ buyer_id: userId, entitlement_id: ent.id, kind: "download" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("creator-guides")
      .createSignedUrl(item.file_path, LINK_SECONDS, { download: item.file_name ?? true });
    if (error || !signed) return { error: "We couldn’t prepare the file. Please try again." };
    const { data: first } = await supabaseAdmin.rpc("mark_guide_first_download", { p_guide_id: ent.guide_id });
    if (first) {
      try {
        await emailCreatorFirstDownload(ent.guide_id, siteOrigin());
      } catch (e) {
        console.error("first-download email failed", e);
      }
    }
    return { url: signed.signedUrl };
  });

export type LinkContentItem = {
  id: string;
  section: string;
  position: number;
  kind: "file" | "video" | "link" | "text" | "tool";
  title: string;
  description: string;
  file_name: string | null;
  url: string | null;
  tool_key: string | null;
  tool_config: Record<string, string | number | boolean | null>;
};

const tokenSchema = z.object({ token: z.string().regex(TOKEN_PATTERN, "This link isn’t valid.") });

/** Playbook contents behind an emailed link (no file addresses; files are fetched one by one). */
export const getLinkContents = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => tokenSchema.parse(input))
  .handler(async ({ data }): Promise<{ hasMainFile: boolean; items: LinkContentItem[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin
      .from("download_links")
      .select("version_id, expires_at, download_count, max_downloads")
      .eq("token_hash", await hashLinkToken(data.token))
      .maybeSingle();
    if (!link) return { hasMainFile: false, items: [] };
    if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) return { hasMainFile: false, items: [] };
    const [{ data: version }, { data: items }] = await Promise.all([
      supabaseAdmin.from("guide_versions").select("file_path").eq("id", link.version_id).maybeSingle(),
      supabaseAdmin
        .from("product_items")
        .select("id, section, position, kind, title, description, file_name, url, tool_key, tool_config")
        .eq("version_id", link.version_id)
        .order("position"),
    ]);
    return {
      hasMainFile: Boolean(version?.file_path),
      items: (items ?? []) as LinkContentItem[],
    };
  });

/** Uses one download from the emailed link for a single playbook file. */
export const downloadItemFromLink = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; itemId: string }) => ({
    ...tokenSchema.parse({ token: input?.token }),
    itemId: uuid.parse(input?.itemId),
  }))
  .handler(async ({ data }): Promise<{ url: string } | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("consume_download_link_item", {
      p_token_hash: await hashLinkToken(data.token),
      p_item_id: data.itemId,
    });
    if (error) return { error: "We couldn’t start the download. Please try again." };
    const r = result as { outcome: string; file_path?: string; file_name?: string | null; guide_id?: string; first_for_guide?: boolean };
    if (r.outcome === "expired") return { error: "This download link has expired." };
    if (r.outcome === "limit") return { error: "This link has reached its download limit." };
    if (r.outcome !== "ok" || !r.file_path) return { error: "This file is no longer available." };
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("creator-guides")
      .createSignedUrl(r.file_path, LINK_SECONDS, { download: r.file_name ?? true });
    if (signError || !signed) return { error: "We couldn’t prepare the file. Please try again." };
    if (r.first_for_guide && r.guide_id) {
      try {
        await emailCreatorFirstDownload(r.guide_id, siteOrigin());
      } catch (e) {
        console.error("first-download email failed", e);
      }
    }
    return { url: signed.signedUrl };
  });
