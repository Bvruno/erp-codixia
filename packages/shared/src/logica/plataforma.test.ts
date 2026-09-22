import { describe, expect, it } from 'vitest';
import {
  zCrearEmpresaOwner,
  zFactura,
  zRechazarSolicitud,
  zSolicitudOwner,
  zSuscripcion,
} from './plataforma';

describe('zSolicitudOwner', () => {
  const valida = {
    nombre_contacto: 'Ana Pérez',
    email: 'ana@empresa.com',
    empresa: 'Empresa SA',
    consentimiento: true as const,
  };

  it('acepta la solicitud mínima', () => {
    const res = zSolicitudOwner.safeParse(valida);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.telefono).toBeNull();
      expect(res.data.tamano_equipo).toBeUndefined();
    }
  });

  it('normaliza opcionales vacíos a null', () => {
    const res = zSolicitudOwner.safeParse({ ...valida, telefono: '', sitio_web: '' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.telefono).toBeNull();
      expect(res.data.sitio_web).toBeNull();
    }
  });

  it('rechaza sin consentimiento', () => {
    const res = zSolicitudOwner.safeParse({ ...valida, consentimiento: false });
    expect(res.success).toBe(false);
  });

  it('rechaza email inválido', () => {
    const res = zSolicitudOwner.safeParse({ ...valida, email: 'no-es-email' });
    expect(res.success).toBe(false);
  });

  it('rechaza tamaño de equipo fuera del catálogo', () => {
    const res = zSolicitudOwner.safeParse({ ...valida, tamano_equipo: '1000+' });
    expect(res.success).toBe(false);
  });
});

describe('zRechazarSolicitud', () => {
  it('exige motivo', () => {
    expect(zRechazarSolicitud.safeParse({ motivo: '   ' }).success).toBe(false);
    expect(zRechazarSolicitud.safeParse({ motivo: 'Duplicada' }).success).toBe(true);
  });
});

describe('zCrearEmpresaOwner', () => {
  it('aplica 14 días por defecto', () => {
    const res = zCrearEmpresaOwner.safeParse({ nombre: 'Mi Empresa' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.dias_invitacion).toBe(14);
  });

  it('rechaza expiración fuera de rango', () => {
    expect(zCrearEmpresaOwner.safeParse({ nombre: 'X', dias_invitacion: 0 }).success).toBe(false);
    expect(zCrearEmpresaOwner.safeParse({ nombre: 'X', dias_invitacion: 91 }).success).toBe(false);
  });
});

describe('zSuscripcion', () => {
  it('estado por defecto activa', () => {
    const res = zSuscripcion.safeParse({ plan_id: 'pro' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.estado).toBe('activa');
  });

  it('rechaza estado desconocido', () => {
    expect(zSuscripcion.safeParse({ plan_id: 'pro', estado: 'vivo' }).success).toBe(false);
  });
});

describe('zFactura', () => {
  it('acepta factura completa', () => {
    const res = zFactura.safeParse({
      organization_id: '00000000-0000-0000-0000-000000000000',
      periodo: '2026-09',
      monto: 49,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.estado).toBe('pendiente');
      expect(res.data.moneda).toBe('USD');
    }
  });

  it('rechaza organización no UUID', () => {
    expect(
      zFactura.safeParse({ organization_id: 'abc', periodo: '2026-09', monto: 1 }).success
    ).toBe(false);
  });
});
