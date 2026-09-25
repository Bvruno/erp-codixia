-- Renombra el valor default_view "tareas" -> "proyectos" (área renombrada a Proyectos)
UPDATE profiles
SET preferences = jsonb_set(
    preferences,
    '{default_view}',
    '"proyectos"'::jsonb
)
WHERE preferences->>'default_view' = 'tareas';
