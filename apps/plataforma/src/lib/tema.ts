const CLAVE = 'plataforma-tema';
export type Tema = 'dark' | 'light';

export function temaActual(): Tema {
  const guardado = localStorage.getItem(CLAVE);
  return guardado === 'light' ? 'light' : 'dark';
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.mode = tema;
  localStorage.setItem(CLAVE, tema);
}

export function iniciarTema(): void {
  document.documentElement.dataset.mode = temaActual();
}
