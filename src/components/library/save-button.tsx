import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MarketplaceAuthDialog } from "@/components/marketplace-auth-dialog";
import { useMarketplaceAuth } from "@/hooks/use-marketplace-auth";
import { supabase } from "@/integrations/supabase/client";

/** Save / bookmark a product to the personal library. */
export function SaveProductButton({ guideId }: { guideId: string }) {
  const { user, ready } = useMarketplaceAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (!ready || !user) return setSaved(false);
    let active = true;
    void supabase
      .from("saved_products")
      .select("guide_id")
      .eq("user_id", user.id)
      .eq("guide_id", guideId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setSaved(Boolean(data));
      });
    return () => {
      active = false;
    };
  }, [ready, user, guideId]);

  async function toggle() {
    if (!user) return setAuthOpen(true);
    setBusy(true);
    const { error } = saved
      ? await supabase.from("saved_products").delete().eq("user_id", user.id).eq("guide_id", guideId)
      : await supabase.from("saved_products").insert({ user_id: user.id, guide_id: guideId });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSaved(!saved);
    toast.success(saved ? "Removed from your library." : "Saved to your library.");
  }

  return (
    <>
      <Button variant="ghost" className="save-trigger" disabled={busy} aria-pressed={saved} onClick={() => void toggle()}>
        {saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        {saved ? "Saved to your library" : "Save for later"}
      </Button>
      <MarketplaceAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}
