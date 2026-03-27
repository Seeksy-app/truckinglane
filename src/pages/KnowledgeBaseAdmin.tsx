import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  GripVertical,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  Eye,
} from "lucide-react";

type KbMediaRow = {
  id: string;
  article_id: string;
  url: string;
  caption: string | null;
  media_order: number;
  created_at: string;
};

type KbArticleRow = {
  id: string;
  title: string;
  content: string | null;
  section_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  kb_media: KbMediaRow[] | null;
};

function sortedMedia(media: KbMediaRow[] | null | undefined) {
  if (!media?.length) return [];
  return [...media].sort((a, b) => a.media_order - b.media_order);
}

function ArticlePreviewBody({
  title,
  content,
  media,
}: {
  title: string;
  content: string;
  media: KbMediaRow[];
}) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-foreground">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="whitespace-pre-wrap text-muted-foreground">{content || "—"}</div>
      {sortedMedia(media).map((m) => (
        <figure key={m.id} className="space-y-2">
          <img
            src={m.url}
            alt={m.caption || ""}
            className="rounded-lg border border-border max-w-full h-auto"
          />
          {m.caption ? (
            <figcaption className="text-sm text-muted-foreground">{m.caption}</figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

function SortableRow({
  article,
  onEdit,
  onDelete,
  onPreview,
}: {
  article: KbArticleRow;
  onEdit: (a: KbArticleRow) => void;
  onDelete: (a: KbArticleRow) => void;
  onPreview: (a: KbArticleRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: article.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{article.title}</div>
        <div className="text-xs text-muted-foreground">
          {article.is_published ? "Published" : "Draft"} · order {article.section_order}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => onPreview(article)}>
          <Eye className="h-3.5 w-3.5" />
          Preview
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => onEdit(article)}>
          Edit
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(article)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function KnowledgeBaseAdmin() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<KbArticleRow | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formPublished, setFormPublished] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewArticle, setPreviewArticle] = useState<KbArticleRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KbArticleRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const articlesQuery = useQuery({
    queryKey: ["kb_articles_admin", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kb_articles")
        .select("*, kb_media (*)")
        .order("section_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as KbArticleRow[];
    },
    enabled: role === "super_admin" && !!user,
  });

  const articles = articlesQuery.data ?? [];

  const [orderIds, setOrderIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!articlesQuery.data?.length) {
      setOrderIds(null);
      return;
    }
    setOrderIds(articlesQuery.data.map((a) => a.id));
  }, [articlesQuery.data]);

  const orderedIds = orderIds ?? articles.map((a) => a.id);

  const orderedArticles = useMemo(() => {
    const byId = new Map(articles.map((a) => [a.id, a]));
    return orderedIds.map((id) => byId.get(id)).filter((a): a is KbArticleRow => a != null);
  }, [articles, orderedIds]);

  const persistOrderMutation = useMutation({
    mutationFn: async (newOrder: string[]) => {
      const results = await Promise.all(
        newOrder.map((id, index) =>
          supabase.from("kb_articles").update({ section_order: index }).eq("id", id),
        ),
      );
      for (const r of results) {
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb_articles_admin"] });
      toast.success("Order updated");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to save order");
      if (articlesQuery.data?.length) {
        setOrderIds(articlesQuery.data.map((a) => a.id));
      }
    },
  });

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = [...orderedIds];
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(ids, oldIndex, newIndex);
      setOrderIds(next);
      persistOrderMutation.mutate(next);
    },
    [orderedIds, persistOrderMutation],
  );

  const addArticleMutation = useMutation({
    mutationFn: async () => {
      const maxRes = await supabase
        .from("kb_articles")
        .select("section_order")
        .order("section_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxRes.error) throw maxRes.error;
      const nextOrder = (maxRes.data?.section_order ?? -1) + 1;
      const { data, error } = await supabase
        .from("kb_articles")
        .insert({
          title: "Untitled article",
          content: "",
          section_order: nextOrder,
          is_published: false,
        })
        .select("*, kb_media (*)")
        .single();
      if (error) throw error;
      return data as KbArticleRow;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["kb_articles_admin"] });
      setEditing(row);
      setFormTitle(row.title);
      setFormContent(row.content ?? "");
      setFormPublished(row.is_published);
      setEditOpen(true);
      toast.success("Article created");
    },
    onError: (e: Error) => toast.error(e.message || "Could not create article"),
  });

  const saveArticleMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("kb_articles")
        .update({
          title: formTitle.trim() || "Untitled",
          content: formContent,
          is_published: formPublished,
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb_articles_admin"] });
      queryClient.invalidateQueries({ queryKey: ["kb_articles_help"] });
      setEditOpen(false);
      setEditing(null);
      toast.success("Article saved");
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  const deleteArticleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kb_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb_articles_admin"] });
      queryClient.invalidateQueries({ queryKey: ["kb_articles_help"] });
      setDeleteTarget(null);
      toast.success("Article deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });

  const updateCaptionMutation = useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const { error } = await supabase.from("kb_media").update({ caption: caption || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb_articles_admin"] });
      queryClient.invalidateQueries({ queryKey: ["kb_articles_help"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update caption"),
  });

  const deleteMediaMutation = useMutation({
    mutationFn: async (row: KbMediaRow) => {
      const path = row.url.split("/object/public/kb-media/")[1];
      if (path) {
        await supabase.storage.from("kb-media").remove([decodeURIComponent(path)]);
      }
      const { error } = await supabase.from("kb_media").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: async (_, row) => {
      queryClient.invalidateQueries({ queryKey: ["kb_articles_admin"] });
      queryClient.invalidateQueries({ queryKey: ["kb_articles_help"] });
      const { data } = await supabase
        .from("kb_articles")
        .select("*, kb_media (*)")
        .eq("id", row.article_id)
        .single();
      if (data) {
        setEditing((prev) => (prev?.id === row.article_id ? (data as KbArticleRow) : prev));
      }
      toast.success("Image removed");
    },
    onError: (e: Error) => toast.error(e.message || "Could not remove image"),
  });

  async function handleImageUpload(file: File) {
    if (!editing) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? ext : "jpg";
    const path = `${editing.id}/${crypto.randomUUID()}.${safeExt}`;
    setUploading(true);
    try {
      const { error: upErr } = await supabase.storage.from("kb-media").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from("kb-media").getPublicUrl(path);
      const maxOrderRes = await supabase
        .from("kb_media")
        .select("media_order")
        .eq("article_id", editing.id)
        .order("media_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextMediaOrder = (maxOrderRes.data?.media_order ?? -1) + 1;
      const { error: insErr } = await supabase.from("kb_media").insert({
        article_id: editing.id,
        url: publicUrl,
        caption: null,
        media_order: nextMediaOrder,
      });
      if (insErr) throw insErr;
      const { data: fresh, error: freshErr } = await supabase
        .from("kb_articles")
        .select("*, kb_media (*)")
        .eq("id", editing.id)
        .single();
      if (freshErr) throw freshErr;
      setEditing(fresh as KbArticleRow);
      queryClient.invalidateQueries({ queryKey: ["kb_articles_admin"] });
      queryClient.invalidateQueries({ queryKey: ["kb_articles_help"] });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function openEdit(a: KbArticleRow) {
    setEditing(a);
    setFormTitle(a.title);
    setFormContent(a.content ?? "");
    setFormPublished(a.is_published);
    setEditOpen(true);
  }

  function openPreview(a: KbArticleRow) {
    setPreviewArticle(a);
    setPreviewOpen(true);
  }

  if (!roleLoading && role !== "super_admin") {
    navigate("/dashboard");
    return null;
  }

  if (roleLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 gap-1 px-0" onClick={() => navigate("/platform")}>
              <ArrowLeft className="h-4 w-4" />
              Platform
            </Button>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
                <p className="text-sm text-muted-foreground">Articles shown to agents on the Help page.</p>
              </div>
            </div>
          </div>
          <Button className="gap-2" onClick={() => addArticleMutation.mutate()} disabled={addArticleMutation.isPending}>
            {addArticleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add article
          </Button>
        </div>

        {articlesQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : articles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
            No articles yet. Click &quot;Add article&quot; to create one.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {orderedArticles.map((a) => (
                  <SortableRow
                    key={a.id}
                    article={a}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    onPreview={openPreview}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {persistOrderMutation.isPending ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">Saving order…</p>
        ) : null}
      </main>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEditOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit article</DialogTitle>
            <DialogDescription>Title, body text, publish status, and images for the Help center.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="kb-title">Title</Label>
              <Input
                id="kb-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Section title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kb-content">Content</Label>
              <Textarea
                id="kb-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Help text (plain text; line breaks are preserved)"
                rows={12}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label htmlFor="kb-published" className="text-base">
                  Published
                </Label>
                <p className="text-xs text-muted-foreground">Visible on /help for agents</p>
              </div>
              <Switch id="kb-published" checked={formPublished} onCheckedChange={setFormPublished} />
            </div>

            {editing ? (
              <div className="space-y-3">
                <Label>Images</Label>
                <div className="space-y-3">
                  {sortedMedia(editing.kb_media).map((m) => (
                    <div key={m.id} className="rounded-md border border-border p-2">
                      <div className="flex gap-2">
                        <img src={m.url} alt="" className="h-20 w-auto rounded object-cover" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <Input
                            placeholder="Caption (optional)"
                            value={m.caption ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditing((prev) => {
                                if (!prev) return prev;
                                const list = prev.kb_media ? [...prev.kb_media] : [];
                                const i = list.findIndex((x) => x.id === m.id);
                                if (i >= 0) list[i] = { ...list[i], caption: v };
                                return { ...prev, kb_media: list };
                              });
                            }}
                            onBlur={() => {
                              const current = editing?.kb_media?.find((x) => x.id === m.id);
                              if (!current) return;
                              updateCaptionMutation.mutate({
                                id: m.id,
                                caption: current.caption ?? "",
                              });
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => deleteMediaMutation.mutate(m)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Remove image
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleImageUpload(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Upload image
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => (setEditOpen(false), setEditing(null))}>
              Cancel
            </Button>
            <Button onClick={() => saveArticleMutation.mutate()} disabled={saveArticleMutation.isPending}>
              {saveArticleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agent preview</DialogTitle>
            <DialogDescription>
              {previewArticle?.is_published
                ? "This is how this article appears on Help."
                : "Draft — agents only see this after you publish. Layout below matches how it will look."}
            </DialogDescription>
          </DialogHeader>
          {previewArticle ? (
            <ArticlePreviewBody
              title={previewArticle.title}
              content={previewArticle.content ?? ""}
              media={previewArticle.kb_media ?? []}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete article?"
        description={`This removes “${deleteTarget?.title ?? ""}” and its images from the knowledge base. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteArticleMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
