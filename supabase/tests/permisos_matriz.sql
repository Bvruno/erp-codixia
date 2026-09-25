-- ============================================================
-- Matriz de permisos (RLS) — se ejecuta dentro de una transacción y
-- termina con ROLLBACK: no deja datos.
--
-- Cubre: herencia (solo private corta), capado de herencia a write,
-- crear exige contenedor visible, creador recibe manage, compartir
-- requiere manage, grants_only navega por ancestros y aislamiento
-- entre organizaciones (SELECT/INSERT/UPDATE/DELETE).
--
-- Uso local:  supabase test db   (o psql "$DATABASE_URL" -f este-archivo)
-- ============================================================

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
 ('00000000-0000-4000-8000-000000000001','owner.a@test.local','x',now(),'{}','{"full_name":"Owner A"}',now(),now()),
 ('00000000-0000-4000-8000-000000000002','collab.a@test.local','x',now(),'{}','{"full_name":"Collab A"}',now(),now()),
 ('00000000-0000-4000-8000-000000000003','scoped.a@test.local','x',now(),'{}','{"full_name":"Scoped A"}',now(),now()),
 ('00000000-0000-4000-8000-000000000004','admin.b@test.local','x',now(),'{}','{"full_name":"Admin B"}',now(),now()),
 ('00000000-0000-4000-8000-000000000005','man.a@test.local','x',now(),'{}','{"full_name":"Man A"}',now(),now());

INSERT INTO organizations (id, name, owner_id) VALUES
 ('00000000-0000-4000-9000-00000000000a','Test Org A','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-9000-00000000000b','Test Org B','00000000-0000-4000-8000-000000000004');

UPDATE profiles SET organization_id='00000000-0000-4000-9000-00000000000a', role='admin', is_owner=true WHERE id='00000000-0000-4000-8000-000000000001';
UPDATE profiles SET organization_id='00000000-0000-4000-9000-00000000000a', role='collaborator' WHERE id='00000000-0000-4000-8000-000000000002';
UPDATE profiles SET organization_id='00000000-0000-4000-9000-00000000000a', role='collaborator', access_mode='grants_only' WHERE id='00000000-0000-4000-8000-000000000003';
UPDATE profiles SET organization_id='00000000-0000-4000-9000-00000000000b', role='admin', is_owner=true WHERE id='00000000-0000-4000-8000-000000000004';
UPDATE profiles SET organization_id='00000000-0000-4000-9000-00000000000a', role='collaborator' WHERE id='00000000-0000-4000-8000-000000000005';

INSERT INTO workspaces (id, organization_id, name, visibility) VALUES
 ('00000000-0000-4000-a000-000000000001','00000000-0000-4000-9000-00000000000a','WS A','public'),
 ('00000000-0000-4000-a000-000000000002','00000000-0000-4000-9000-00000000000b','WS B','public');

INSERT INTO workspace_folders (id, workspace_id, name, visibility) VALUES
 ('00000000-0000-4000-b000-000000000001','00000000-0000-4000-a000-000000000001','F Pub','public'),
 ('00000000-0000-4000-b000-000000000002','00000000-0000-4000-a000-000000000001','F Rest','restricted'),
 ('00000000-0000-4000-b000-000000000003','00000000-0000-4000-a000-000000000001','F Priv','private');

INSERT INTO documents (id, organization_id, workspace_id, folder_id, name, visibility) VALUES
 ('00000000-0000-4000-c000-000000000001','00000000-0000-4000-9000-00000000000a','00000000-0000-4000-a000-000000000001','00000000-0000-4000-b000-000000000001','Doc Pub','public'),
 ('00000000-0000-4000-c000-000000000002','00000000-0000-4000-9000-00000000000a','00000000-0000-4000-a000-000000000001','00000000-0000-4000-b000-000000000002','Doc En Rest','public'),
 ('00000000-0000-4000-c000-000000000003','00000000-0000-4000-9000-00000000000a','00000000-0000-4000-a000-000000000001','00000000-0000-4000-b000-000000000001','Doc Priv','private'),
 ('00000000-0000-4000-c000-000000000004','00000000-0000-4000-9000-00000000000b','00000000-0000-4000-a000-000000000002',NULL,'Doc B','public');

INSERT INTO entity_visibility (entity_type, entity_id, profile_id, permission, inherit) VALUES
 ('workspace','00000000-0000-4000-a000-000000000001','00000000-0000-4000-8000-000000000002','write',true),
 ('document','00000000-0000-4000-c000-000000000001','00000000-0000-4000-8000-000000000003','read',false),
 ('document','00000000-0000-4000-c000-000000000001','00000000-0000-4000-8000-000000000005','manage',false);

-- ---- colaborador con write heredado del workspace ----
DO $$
DECLARE n INT; e TEXT; vis TEXT[]; bulk TEXT[];
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-000000000002')::text, true);

  SELECT array_agg(name ORDER BY name) INTO vis FROM documents;
  IF vis IS DISTINCT FROM ARRAY['Doc En Rest','Doc Pub'] THEN
    RAISE EXCEPTION 'collab ve % (esperado Doc En Rest + Doc Pub)', vis;
  END IF;

  SELECT public.entity_effective('00000000-0000-4000-c000-000000000001') INTO e;
  IF e <> 'write' THEN RAISE EXCEPTION 'efectivo docPub=% (esperado write)', e; END IF;
  SELECT public.entity_effective('00000000-0000-4000-c000-000000000003') INTO e;
  IF e IS NOT NULL THEN RAISE EXCEPTION 'efectivo docPriv=% (esperado NULL)', e; END IF;

  SELECT array_agg(entity_id::text || ':' || coalesce(permission,'null') ORDER BY entity_id) INTO bulk
  FROM public.entity_permissions_bulk('document', ARRAY['00000000-0000-4000-c000-000000000001','00000000-0000-4000-c000-000000000003','00000000-0000-4000-c000-000000000002']::uuid[]);
  IF bulk IS DISTINCT FROM ARRAY[
    '00000000-0000-4000-c000-000000000001:write',
    '00000000-0000-4000-c000-000000000002:write',
    '00000000-0000-4000-c000-000000000003:null'] THEN
    RAISE EXCEPTION 'bulk=% (esperado write/write/null)', bulk;
  END IF;

  BEGIN
    INSERT INTO documents (organization_id, workspace_id, folder_id, name, visibility)
    VALUES ('00000000-0000-4000-9000-00000000000a','00000000-0000-4000-a000-000000000001','00000000-0000-4000-b000-000000000001','Nuevo Pub','public');
  EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'collab NO pudo crear en F Pub';
  END;

  BEGIN
    INSERT INTO documents (organization_id, workspace_id, folder_id, name, visibility)
    VALUES ('00000000-0000-4000-9000-00000000000a','00000000-0000-4000-a000-000000000001','00000000-0000-4000-b000-000000000002','Nuevo Rest','public');
  EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'collab NO pudo crear en F Rest (restringido debe heredar)';
  END;

  BEGIN
    INSERT INTO documents (organization_id, workspace_id, folder_id, name, visibility)
    VALUES ('00000000-0000-4000-9000-00000000000a','00000000-0000-4000-a000-000000000001','00000000-0000-4000-b000-000000000003','Nuevo Priv','public');
    RAISE EXCEPTION 'collab PUDO crear en F Priv (bug crear-sin-ver)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE documents SET name='Doc Pub' WHERE id='00000000-0000-4000-c000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'collab no pudo editar docPub con write heredado (n=%)', n; END IF;

  DELETE FROM documents WHERE id='00000000-0000-4000-c000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'collab PUDO borrar docPub (write no debe borrar)'; END IF;

  DELETE FROM documents WHERE name='Nuevo Pub';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'collab no pudo borrar su propio documento (creador=manage) n=%', n; END IF;

  BEGIN
    INSERT INTO entity_visibility (entity_type, entity_id, profile_id, permission, inherit)
    VALUES ('document','00000000-0000-4000-c000-000000000001','00000000-0000-4000-8000-000000000001','read',false);
    RAISE EXCEPTION 'collab PUDO compartir sin manage (bug)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

-- ---- quien tiene manage puede compartir; no cross-org ----
DO $$
DECLARE n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-000000000005')::text, true);

  DELETE FROM entity_visibility WHERE entity_id='00000000-0000-4000-c000-000000000001' AND profile_id='00000000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'manage no pudo quitar un grant (n=%)', n; END IF;

  INSERT INTO entity_visibility (entity_type, entity_id, profile_id, permission, inherit)
  VALUES ('document','00000000-0000-4000-c000-000000000001','00000000-0000-4000-8000-000000000003','read',false);

  BEGIN
    INSERT INTO entity_visibility (entity_type, entity_id, profile_id, permission, inherit)
    VALUES ('document','00000000-0000-4000-c000-000000000001','00000000-0000-4000-8000-000000000004','read',false);
    RAISE EXCEPTION 'manage pudo otorgar a usuario de otra org (bug)';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN NULL;
  END;
END;
$$;

-- ---- invitado scoped: solo su grant, con ancestros navegables ----
DO $$
DECLARE vis TEXT[];
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-000000000003')::text, true);

  SELECT array_agg(name ORDER BY name) INTO vis FROM documents;
  IF vis IS DISTINCT FROM ARRAY['Doc Pub'] THEN
    RAISE EXCEPTION 'scoped ve % (esperado solo Doc Pub)', vis;
  END IF;

  SELECT array_agg(name ORDER BY name) INTO vis FROM workspace_folders;
  IF vis IS DISTINCT FROM ARRAY['F Pub'] THEN
    RAISE EXCEPTION 'scoped carpetas=% (esperado F Pub navegable)', vis;
  END IF;

  SELECT array_agg(name ORDER BY name) INTO vis FROM workspaces;
  IF vis IS DISTINCT FROM ARRAY['WS A'] THEN
    RAISE EXCEPTION 'scoped workspaces=% (esperado WS A navegable)', vis;
  END IF;
END;
$$;

-- ---- admin de otra organización: nada ----
DO $$
DECLARE n INT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-4000-8000-000000000004')::text, true);

  SELECT count(*) INTO n FROM documents;
  IF n <> 1 THEN RAISE EXCEPTION 'admin B ve % documentos (esperado 1)', n; END IF;

  UPDATE documents SET name='hack' WHERE id='00000000-0000-4000-c000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'admin B PUDO editar doc de org A (bug cross-tenant)'; END IF;

  DELETE FROM documents WHERE id='00000000-0000-4000-c000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'admin B PUDO borrar doc de org A (bug cross-tenant)'; END IF;

  BEGIN
    INSERT INTO documents (organization_id, workspace_id, folder_id, name, visibility)
    VALUES ('00000000-0000-4000-9000-00000000000a','00000000-0000-4000-a000-000000000001','00000000-0000-4000-b000-000000000001','Intruso','public');
    RAISE EXCEPTION 'admin B PUDO insertar en org A (bug cross-tenant)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

SELECT 'MATRIZ OK' AS resultado;

ROLLBACK;
