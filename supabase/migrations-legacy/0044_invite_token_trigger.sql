-- ============================================================
-- AUTO-HASH DE TOKENS DE INVITACIÓN
--  Backfill: cualquier token crudo residual (creado por código
--  viejo) pasa a SHA-256. Trigger: protege contra inserts que
--  vuelvan a guardar el token en texto plano.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Backfill idempotente: solo toca tokens que no son ya 64-hex.
UPDATE invitations
SET token = encode(digest(token, 'sha256'), 'hex')
WHERE token !~ '^[0-9a-f]{64}$';

CREATE OR REPLACE FUNCTION hash_invite_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.token !~ '^[0-9a-f]{64}$' THEN
    NEW.token := encode(extensions.digest(NEW.token, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invitations_hash_token ON invitations;
CREATE TRIGGER trg_invitations_hash_token
  BEFORE INSERT OR UPDATE OF token ON invitations
  FOR EACH ROW EXECUTE FUNCTION hash_invite_token();