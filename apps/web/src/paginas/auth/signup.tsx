import { useEffect, useState } from 'react';
import { SignupForm } from './signup-form';
import { API_URL } from '@/lib/api/base';

export default function SignupPage() {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite') ?? '';
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!inviteToken) {
      window.location.assign('/login');
      return;
    }
    fetch(`${API_URL}/invitaciones/${encodeURIComponent(inviteToken)}`)
      .then((res) => setInviteValid(res.ok))
      .catch(() => setInviteValid(false));
  }, [inviteToken]);

  if (inviteValid === null) return null;
  if (!inviteValid) {
    window.location.assign(`/invitacion/${encodeURIComponent(inviteToken)}`);
    return null;
  }

  return <SignupForm inviteToken={inviteToken} inviteValid={inviteValid} />;
}