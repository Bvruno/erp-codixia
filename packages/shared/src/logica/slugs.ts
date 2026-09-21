/**
 * Slugs para URLs de tareas: el URL muestra un slug derivado del
 * nombre (legible) en lugar del UUID completo. La resolución acepta
 * slug, UUID completo o prefijo corto, así que las URLs viejas nunca
 * se rompen.
 */

export const RESERVED_SLUGS = new Set(['raiz']);

export const SHORT_ID_LENGTH = 12;

export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return slug || 'item';
}

export function shortId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, SHORT_ID_LENGTH);
}

/** Prefijo corto del UUID (también válido como segmento de URL). */
export function shortUid(id: string): string {
  return shortId(id);
}

export interface SlugEntity {
  id: string;
  name: string;
  position?: number | null;
}

function siblingSlug(entity: SlugEntity, siblings: SlugEntity[]): string {
  let slug = slugify(entity.name);
  if (RESERVED_SLUGS.has(slug)) {
    slug = `${slug}-2`;
  }
  const colliding = siblings.filter(
    (s) => s.id !== entity.id && slugify(s.name) === slug
  );
  if (colliding.length > 0) {
    const all = [...colliding, entity];
    const first = all.reduce((min, s) =>
      (s.position ?? 0) < (min.position ?? 0) ? s : min
    );
    if (first.id !== entity.id) {
      const before = colliding.filter(
        (s) => (s.position ?? 0) < (entity.position ?? 0)
      ).length;
      slug = `${slug}-${before + 1}`;
    }
  }
  return slug;
}

/**
 * Slug determinista de una entidad dentro de su conjunto de hermanos.
 * El mismo cálculo se usa al construir la URL y al resolverla, por lo
 * que nunca hay ambigüedad (incluso con nombres que colisionan al
 * slugificar, p. ej. "Mi Área" vs "mi-area").
 */
export function entitySlug(entity: SlugEntity, siblings: SlugEntity[]): string {
  return siblingSlug(entity, siblings);
}

/**
 * ¿El parámetro del URL corresponde a esta entidad?
 * Acepta: slug del nombre, UUID completo, prefijo corto del UUID.
 */
export function matchParam(param: string, id: string, name: string): boolean {
  if (param === id) return true;
  const compact = id.replace(/-/g, '');
  if (param === compact || compact.startsWith(param)) return true;
  return param === slugify(name);
}

/**
 * Resuelve un parámetro contra el conjunto de hermanos: primero por
 * slug determinista (incluye sufijos por colisión), luego por
 * uuid/prefijo/name.
 */
export function findEntityByParam<T extends SlugEntity>(
  param: string,
  siblings: T[]
): T | undefined {
  const bySlug = new Map(siblings.map((s) => [siblingSlug(s, siblings), s]));
  const viaSlug = bySlug.get(param);
  if (viaSlug) return viaSlug;
  return siblings.find((s) => matchParam(param, s.id, s.name));
}

/** ¿El parámetro es un UUID completo? */
export function isFullUuid(param: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    param
  );
}