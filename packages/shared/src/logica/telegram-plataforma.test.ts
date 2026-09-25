import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS_TELEGRAM,
  EVENTOS_TELEGRAM,
  ZONA_HORARIA_DEFAULT,
  definicionEvento,
  fechaEnZona,
  horaEnZona,
  renderPlantilla,
  zConfigTelegram,
} from './telegram-plataforma';

describe('catálogo de eventos de telegram', () => {
  it('no tiene eventos duplicados', () => {
    const claves = EVENTOS_TELEGRAM.map((e) => e.evento);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('cada evento usa una categoría válida', () => {
    const validas = new Set(CATEGORIAS_TELEGRAM.map((c) => c.id));
    for (const evento of EVENTOS_TELEGRAM) {
      expect(validas.has(evento.categoria), evento.evento).toBe(true);
    }
  });

  it('las plantillas solo usan variables declaradas', () => {
    for (const evento of EVENTOS_TELEGRAM) {
      const usadas = [...evento.plantilla.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map(
        (m) => m[1]
      );
      for (const variable of usadas) {
        expect(evento.variables, `${evento.evento} usa {{${variable}}}`).toContain(variable);
      }
    }
  });

  it('definicionEvento encuentra por clave', () => {
    expect(definicionEvento('error_nuevo')?.categoria).toBe('salud');
    expect(definicionEvento('no_existe')).toBeNull();
  });
});

describe('renderPlantilla', () => {
  it('reemplaza variables y colapsa líneas vacías', () => {
    const res = renderPlantilla('Hola {{nombre}}\n\n\n{{extra}}', { nombre: 'Ana' });
    expect(res.texto).toBe('Hola Ana');
    expect(res.faltantes).toEqual(['extra']);
  });

  it('reporta variables faltantes sin duplicar', () => {
    const res = renderPlantilla('{{a}} {{a}} {{b}}', { b: 'x' });
    expect(res.faltantes).toEqual(['a']);
    expect(res.texto).toBe('x');
  });

  it('trata null/vacío como faltante', () => {
    const res = renderPlantilla('{{a}}-{{b}}', { a: null, b: '' });
    expect(res.faltantes.sort()).toEqual(['a', 'b']);
  });

  it('convierte números a texto', () => {
    const res = renderPlantilla('Veces: {{veces}}', { veces: 3 });
    expect(res.texto).toBe('Veces: 3');
  });
});

describe('zConfigTelegram', () => {
  it('acepta config parcial y normaliza vacíos a null', () => {
    const res = zConfigTelegram.safeParse({ bot_token: '', chat_destino: '123' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.bot_token).toBeNull();
      expect(res.data.chat_destino).toBe('123');
    }
  });

  it('rechaza hora inválida en digest', () => {
    expect(zConfigTelegram.safeParse({ digest_hora: '25:00' }).success).toBe(false);
    expect(zConfigTelegram.safeParse({ digest_hora: '09:30' }).success).toBe(true);
  });

  it('rechaza rate limit fuera de rango', () => {
    expect(zConfigTelegram.safeParse({ rate_limit_hora: 0 }).success).toBe(false);
  });

  it('acepta horario de silencio sin zona horaria', () => {
    const res = zConfigTelegram.safeParse({ quiet_hours: { activo: true } });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.quiet_hours).toEqual({ activo: true, desde: '22:00', hasta: '08:00' });
    }
  });
});

describe('zona horaria fija de Perú', () => {
  it('la constante es America/Lima', () => {
    expect(ZONA_HORARIA_DEFAULT).toBe('America/Lima');
  });

  it('horaEnZona convierte a la hora local', () => {
    const momento = new Date('2026-09-22T10:30:00Z');
    expect(horaEnZona(ZONA_HORARIA_DEFAULT, momento)).toBe('05:30');
  });

  it('fechaEnZona respeta el cambio de día', () => {
    const momento = new Date('2026-09-23T02:00:00Z');
    expect(fechaEnZona(ZONA_HORARIA_DEFAULT, momento)).toBe('2026-09-22');
  });
});
