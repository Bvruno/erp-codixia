import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  // Node >=22 define un localStorage experimental que queda undefined sin
  // --localstorage-file; jsdom no lo sobreescribe y window.localStorage
  // desaparece. Implementación Map-backed sobre Storage.prototype para que
  // los spies de los tests (vi.spyOn(Storage.prototype, 'setItem')) sigan
  // interceptando las llamadas.
  if (!window.localStorage) {
    const almacen = new Map<string, string>();
    const proto = Storage.prototype;
    Object.defineProperty(proto, 'length', {
      configurable: true,
      get: () => almacen.size,
    });
    Object.defineProperty(proto, 'getItem', {
      configurable: true,
      writable: true,
      value: (clave: string) => almacen.get(String(clave)) ?? null,
    });
    Object.defineProperty(proto, 'setItem', {
      configurable: true,
      writable: true,
      value: (clave: string, valor: string) => {
        almacen.set(String(clave), String(valor));
      },
    });
    Object.defineProperty(proto, 'removeItem', {
      configurable: true,
      writable: true,
      value: (clave: string) => {
        almacen.delete(String(clave));
      },
    });
    Object.defineProperty(proto, 'clear', {
      configurable: true,
      writable: true,
      value: () => {
        almacen.clear();
      },
    });
    Object.defineProperty(proto, 'key', {
      configurable: true,
      writable: true,
      value: (indice: number) => Array.from(almacen.keys())[indice] ?? null,
    });
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      value: Object.create(proto) as Storage,
    });
  }

  // Radix (@floating-ui) usa ResizeObserver y matchMedia en jsdom
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  if (!('ResizeObserver' in window)) {
    (window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverMock;
  }

  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  if (!('scrollTo' in window)) {
    Object.defineProperty(window, 'scrollTo', { writable: true, value: vi.fn() });
  }
  if (!('scrollIntoView' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { writable: true, value: vi.fn() });
  }
}

export { fireEvent };
