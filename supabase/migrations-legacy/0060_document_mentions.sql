-- ============================================================
-- PARTE 60: Menciones en documentos
-- Registra cada mención de usuario en una página (dedupe por
-- página+usuario) para notificar por Telegram solo menciones nuevas.
-- La API escribe con service role; la lectura queda sujeta a la RLS
-- de `documents` vía subconsulta (un usuario solo ve menciones de
-- documentos que puede ver).
-- ============================================================

CREATE TABLE IF NOT EXISTS document_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mentioned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, profile_id)
);

CREATE INDEX IF NOT EXISTS document_mentions_document_idx
  ON document_mentions(document_id);

ALTER TABLE document_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_mentions_select" ON document_mentions;
CREATE POLICY "document_mentions_select" ON document_mentions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d WHERE d.id = document_mentions.document_id
    )
  );

-- Inserciones/actualizaciones solo vía service role (API).
REVOKE INSERT, UPDATE, DELETE ON document_mentions FROM anon, authenticated;
