import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { entitySlug } from '@/lib/slugs';

const EMAIL = 'owner.demo@demo.com';
const PASSWORD = 'demo123456';
const API = 'http://localhost:8787';
// Mapa creado por el seed (apps/api/scripts/seed.mjs).
const MAPA_DEMO = 'Mapa demo navegacion';

interface Arbol {
  profile: { organization_id: string };
  workspaces: { id: string; name: string; position?: number | null }[];
  folders: { id: string; name: string; workspace_id: string; position?: number | null }[];
  lists: {
    id: string;
    name: string;
    workspace_id: string;
    folder_id: string | null;
    position?: number | null;
  }[];
  mindmaps: { id: string; name: string }[];
}

interface Tokens {
  access: string;
  refresh: string;
}

// Tokens de la sesión que Supabase persiste en localStorage (el SPA los usa
// para autenticar la API con Bearer + X-Refresh-Token).
async function tokensDeSesion(page: Page): Promise<Tokens> {
  const tokens = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const clave = localStorage.key(i);
      if (!clave || !clave.includes('auth-token')) continue;
      try {
        const valor = JSON.parse(localStorage.getItem(clave) ?? '{}');
        if (valor?.access_token && valor?.refresh_token) {
          return {
            access: valor.access_token as string,
            refresh: valor.refresh_token as string,
          };
        }
      } catch {
        // clave ajena a la sesión
      }
    }
    return null;
  });
  if (!tokens) throw new Error('Sesión de Supabase no encontrada en localStorage');
  return tokens;
}

function cabeceras(tokens: Tokens): Record<string, string> {
  return {
    Authorization: `Bearer ${tokens.access}`,
    'X-Refresh-Token': tokens.refresh,
  };
}

// Primera lista de la org con tareas (el seed garantiza al menos una).
async function listaConTareas(
  request: APIRequestContext,
  arbol: Arbol,
  headers: Record<string, string>
): Promise<Arbol['lists'][number] | null> {
  for (const lista of arbol.lists) {
    const res = await request.get(
      `${API}/tareas?list_id=${encodeURIComponent(lista.id)}&solo_ids=true`,
      { headers }
    );
    if (!res.ok()) continue;
    const data = (await res.json()) as { tasks?: { id: string }[] };
    if ((data.tasks ?? []).length > 0) return lista;
  }
  return null;
}

test.describe('Navegación desde el detalle de tarea', () => {
  test('abrir un mapa desde una tarea no rebota al detalle', async ({ page, request }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/calendario/, { timeout: 15_000 });

    const headers = cabeceras(await tokensDeSesion(page));

    const arbolRes = await request.get(`${API}/entidades/arbol`, { headers });
    expect(arbolRes.ok()).toBeTruthy();
    const arbol = (await arbolRes.json()) as Arbol;

    const lista = await listaConTareas(request, arbol, headers);
    expect(lista, 'Se necesita al menos una lista con tareas (ejecuta el seed)').toBeTruthy();
    if (!lista) return;

    const mapa = arbol.mindmaps.find((m) => m.name === MAPA_DEMO) ?? arbol.mindmaps[0];
    expect(mapa, `Se necesita un mapa (el seed crea "${MAPA_DEMO}")`).toBeTruthy();
    if (!mapa) return;

    const ws = arbol.workspaces.find((w) => w.id === lista.workspace_id);
    expect(ws).toBeTruthy();
    if (!ws) return;
    const carpeta = lista.folder_id
      ? arbol.folders.find((f) => f.id === lista.folder_id)
      : null;
    const rutaLista = `/proyectos/${entitySlug(ws, arbol.workspaces)}/${
      carpeta ? entitySlug(carpeta, arbol.folders) : 'raiz'
    }/${entitySlug(lista, arbol.lists)}`;

    await page.goto(rutaLista);
    const enlaceTarea = page.locator('a[href*="/tarea/"]:visible').first();
    await expect(enlaceTarea).toBeVisible({ timeout: 15_000 });
    await enlaceTarea.click();
    await expect(page).toHaveURL(/\/tarea\//, { timeout: 10_000 });
    // Espera a que el detalle cargue (título): el redirect canónico solo
    // puede secuestrar la navegación cuando ya hay datos de la tarea.
    await expect(page.getByLabel('Título de la tarea')).toBeVisible({ timeout: 10_000 });
    const urlTarea = page.url();

    await page.locator('aside').getByTitle(mapa.name, { exact: true }).click();
    await expect(page).toHaveURL(/\/mapa\//, { timeout: 10_000 });
    // Regresión: el efecto canónico del detalle hacía replace de vuelta a la
    // tarea casi al instante.
    await page.waitForTimeout(1_000);
    expect(page.url()).toContain('/mapa/');
    expect(page.url()).not.toBe(urlTarea);
  });
});
