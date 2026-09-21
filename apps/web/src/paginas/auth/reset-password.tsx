import { useEffect } from 'react';
import { sesionActual } from '@/lib/auth/sesion';
import { ResetPasswordForm } from './reset-password-form';

export default function ResetPasswordPage() {
  useEffect(() => {
    void sesionActual().then((sesion) => {
      if (!sesion) window.location.assign('/login');
    });
  }, []);
  return <ResetPasswordForm />;
}