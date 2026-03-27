-- Knowledge base articles and media (super admin managed; agents read published)

CREATE TABLE public.kb_articles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text,
  section_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kb_media (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  media_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_articles_section_order ON public.kb_articles(section_order);
CREATE INDEX idx_kb_media_article_id ON public.kb_media(article_id);

CREATE TRIGGER update_kb_articles_updated_at
  BEFORE UPDATE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_media ENABLE ROW LEVEL SECURITY;

-- Authenticated users: read published articles; super admins read all
CREATE POLICY "kb_articles_select"
ON public.kb_articles
FOR SELECT
TO authenticated
USING (
  is_published = true
  OR EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

CREATE POLICY "kb_articles_super_admin_insert"
ON public.kb_articles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

CREATE POLICY "kb_articles_super_admin_update"
ON public.kb_articles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

CREATE POLICY "kb_articles_super_admin_delete"
ON public.kb_articles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

-- Media: read if parent article is published or user is super admin
CREATE POLICY "kb_media_select"
ON public.kb_media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kb_articles a
    WHERE a.id = kb_media.article_id
    AND (
      a.is_published = true
      OR EXISTS (
        SELECT 1 FROM public.agency_members m
        WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
      )
    )
  )
);

CREATE POLICY "kb_media_super_admin_insert"
ON public.kb_media
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

CREATE POLICY "kb_media_super_admin_update"
ON public.kb_media
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

CREATE POLICY "kb_media_super_admin_delete"
ON public.kb_media
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

-- Public storage bucket for KB images (readable without auth via public URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('kb-media', 'kb-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "kb_media_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'kb-media');

CREATE POLICY "kb_media_super_admin_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kb-media'
  AND EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

CREATE POLICY "kb_media_super_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'kb-media'
  AND EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
)
WITH CHECK (
  bucket_id = 'kb-media'
  AND EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

CREATE POLICY "kb_media_super_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'kb-media'
  AND EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);
