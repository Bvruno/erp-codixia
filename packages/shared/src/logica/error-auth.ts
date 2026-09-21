export function translateAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos';
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Ya existe una cuenta con ese email';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirma tu email antes de iniciar sesión';
  }
  if (m.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  }
  if (m.includes('network') || m.includes('fetch failed')) {
    return 'Error de conexión. Verifica tu internet.';
  }
  if (m.includes('user not found')) {
    return 'No existe una cuenta con ese email';
  }

  return message;
}
