import { useCallback, useEffect, useState } from "react";
import { FolderPlus, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export type Collection = { id: string; name: string };

/** Personal notes and reading progress for one product in the library. */
export function LibraryNotesProgress({
  userId,
  guideId,
  itemIds,
  done,
  onDoneChange,
}: {
  userId: string;
  guideId: string;
  itemIds: string[];
  done: Set<string>;
  onDoneChange: (done: Set<string>) => void;
}) {
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [percent, setPercent] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from("library_notes").select("body").eq("user_id", userId).eq("guide_id", guideId).maybeSingle(),
      supabase
        .from("library_progress")
        .select("percent, completed_item_ids")
        .eq("user_id", userId)
        .eq("guide_id", guideId)
        .maybeSingle(),
    ]).then(([n, p]) => {
      if (!active) return;
      setNotes(n.data?.body ?? "");
      setSavedNotes(n.data?.body ?? "");
      setPercent(p.data?.percent ?? 0);
      onDoneChange(new Set(p.data?.completed_item_ids ?? []));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, guideId]);

  async function saveNotes() {
    setBusy(true);
    const { error } = await supabase
      .from("library_notes")
      .upsert({ user_id: userId, guide_id: guideId, body: notes.slice(0, 10000), updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSavedNotes(notes);
    toast.success("Notes saved.");
  }

  async function saveManualPercent(value: number) {
    setPercent(value);
    const { error } = await supabase
      .from("library_progress")
      .upsert({ user_id: userId, guide_id: guideId, percent: value, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message);
  }

  const itemPercent = itemIds.length ? Math.round((itemIds.filter((id) => done.has(id)).length / itemIds.length) * 100) : null;
  const shown = itemPercent ?? percent;

  return (
    <div className="library-tools">
      <div className="library-progress">
        <div className="library-progress-head">
          <strong>Progress</strong>
          <span>{shown}%</span>
        </div>
        <span className="qc-bar" aria-hidden="true">
          <span style={{ width: `${shown}%` }} />
        </span>
        {itemPercent === null ? (
          <label className="field-hint">
            How far along are you?{" "}
            <select className="app-select" value={percent} onChange={(e) => void saveManualPercent(Number(e.target.value))}>
              {[0, 10, 25, 50, 75, 90, 100].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Not started" : n === 100 ? "Finished" : `${n}%`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="field-hint">Mark each part done as you work through it.</p>
        )}
      </div>
      <label className="studio-field">
        My notes <span className="field-hint">(only you can see these)</span>
        <Textarea rows={4} maxLength={10000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ideas, reminders, what you tried…" />
      </label>
      <div>
        <Button size="sm" variant="outline" disabled={busy || notes === savedNotes} onClick={() => void saveNotes()}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Save aria-hidden="true" />} Save notes
        </Button>
      </div>
    </div>
  );
}

/** Saves per-item “done” marks and the derived percentage. */
export async function saveItemProgress(userId: string, guideId: string, done: Set<string>, itemIds: string[]) {
  const ids = itemIds.filter((id) => done.has(id));
  const percent = itemIds.length ? Math.round((ids.length / itemIds.length) * 100) : 0;
  return supabase.from("library_progress").upsert({
    user_id: userId,
    guide_id: guideId,
    completed_item_ids: ids,
    percent,
    updated_at: new Date().toISOString(),
  });
}

/** Adds or removes a product from the user's personal collections. */
export function CollectionPicker({
  userId,
  guideId,
  collections,
  memberOf,
  onChanged,
}: {
  userId: string;
  guideId: string;
  collections: Collection[];
  memberOf: Set<string>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function toggle(c: Collection) {
    setBusy(true);
    const { error } = memberOf.has(c.id)
      ? await supabase.from("collection_items").delete().eq("collection_id", c.id).eq("guide_id", guideId)
      : await supabase.from("collection_items").insert({ collection_id: c.id, guide_id: guideId, user_id: userId });
    setBusy(false);
    if (error) return toast.error(error.message);
    onChanged();
  }
  if (!collections.length) return <p className="field-hint">Create a collection above to organise your resources.</p>;
  return (
    <div className="collection-picker" role="group" aria-label="Collections">
      {collections.map((c) => (
        <Button
          key={c.id}
          size="sm"
          type="button"
          variant={memberOf.has(c.id) ? "default" : "outline"}
          aria-pressed={memberOf.has(c.id)}
          disabled={busy}
          onClick={() => void toggle(c)}
        >
          {c.name}
        </Button>
      ))}
    </div>
  );
}

/** Loads the user's collections and which products are in each. */
export function useCollections(userId: string | undefined) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [membership, setMembership] = useState<Record<string, Set<string>>>({});
  const reload = useCallback(async () => {
    if (!userId) return;
    const [c, m] = await Promise.all([
      supabase.from("collections").select("id, name").eq("user_id", userId).order("created_at"),
      supabase.from("collection_items").select("collection_id, guide_id").eq("user_id", userId),
    ]);
    setCollections(c.data ?? []);
    const map: Record<string, Set<string>> = {};
    for (const row of m.data ?? []) (map[row.guide_id] ??= new Set()).add(row.collection_id);
    setMembership(map);
  }, [userId]);
  useEffect(() => void reload(), [reload]);
  return { collections, membership, reload };
}

export function NewCollectionForm({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="new-collection"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        const { error } = await supabase.from("collections").insert({ user_id: userId, name: name.trim().slice(0, 60) });
        setBusy(false);
        if (error) return toast.error(error.message);
        setName("");
        onCreated();
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New collection, e.g. Farming projects" />
      <Button type="submit" size="sm" variant="outline" disabled={busy || !name.trim()}>
        <FolderPlus aria-hidden="true" /> Create
      </Button>
    </form>
  );
}
