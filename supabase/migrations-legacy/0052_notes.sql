-- ============================================================
-- PARTE 52: Notas del calendario (texto + mano alzada)
--  Nueva entidad para el rediseño de /calendario: notas por
--  fecha con contenido de texto o dibujo (mano alzada en tablet).
--  El dibujo se guarda como trazos (jsonb) + snapshot (image).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  note_date date NOT NULL,
  title text NOT NULL DEFAULT 'Nota',
  content text,
  drawing jsonb,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_org_date ON public.notes (organization_id, note_date);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_org" ON public.notes;
CREATE POLICY "notes_select_org" ON public.notes
  FOR SELECT USING (
    public.get_my_org_id() = organization_id
  );

DROP POLICY IF EXISTS "notes_write_org" ON public.notes;
CREATE POLICY "notes_write_org" ON public.notes
  FOR ALL USING (
    public.get_my_org_id() = organization_id
  )
  WITH CHECK (
    public.get_my_org_id() = organization_id
  );

DROP TRIGGER IF EXISTS notes_updated_at ON public.notes;
CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;