'use client';

/**
 * Puente entre el header móvil del dashboard y el drawer del nav de
 * /proyectos: el botón del header (junto al hamburger) abre/cierra el
 * drawer del nav de espacios de trabajo.
 */

type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export const navBus = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => open,
  toggleDrawer() {
    open = !open;
    emit();
  },
  closeDrawer() {
    if (open) {
      open = false;
      emit();
    }
  },
};