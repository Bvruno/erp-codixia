import { describe, it, expect } from 'vitest';
import { translateAuthError } from '@/lib/error-auth';

describe('translateAuthError', () => {
  it('traduce credenciales inválidas', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('Email o contraseña incorrectos');
    expect(translateAuthError('invalid login credentials')).toBe('Email o contraseña incorrectos');
  });

  it('traduce usuario ya registrado', () => {
    expect(translateAuthError('User already registered')).toBe('Ya existe una cuenta con ese email');
    expect(translateAuthError('A user with this email has already been registered')).toBe(
      'Ya existe una cuenta con ese email',
    );
  });

  it('traduce email no confirmado', () => {
    expect(translateAuthError('Email not confirmed')).toBe('Confirma tu email antes de iniciar sesión');
  });

  it('traduce contraseña corta', () => {
    expect(translateAuthError('Password should be at least 6 characters')).toBe(
      'La contraseña debe tener al menos 6 caracteres',
    );
  });

  it('traduce rate limit', () => {
    expect(translateAuthError('Rate limit exceeded')).toBe('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
    expect(translateAuthError('Too many requests')).toBe('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
  });

  it('traduce errores de red', () => {
    expect(translateAuthError('Network error')).toBe('Error de conexión. Verifica tu internet.');
    expect(translateAuthError('fetch failed')).toBe('Error de conexión. Verifica tu internet.');
  });

  it('traduce usuario no encontrado', () => {
    expect(translateAuthError('User not found')).toBe('No existe una cuenta con ese email');
  });

  it('devuelve el mensaje original si no coincide', () => {
    expect(translateAuthError('Otro error raro')).toBe('Otro error raro');
    expect(translateAuthError('')).toBe('');
  });
});


