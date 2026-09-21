import { LoginForm } from './login-form';

export default function LoginPage() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error') ?? undefined;
  return (
    <LoginForm
      initialError={error}
      resetOk={params.get('reset') === 'ok' || undefined}
      loggedNoOrg={error === 'no-access' || undefined}
      invite={params.get('invite') ?? undefined}
    />
  );
}