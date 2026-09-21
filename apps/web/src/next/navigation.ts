import { useNavigate, useLocation, useParams as useParamsTan } from '@tanstack/react-router';

// Shim de next/navigation → TanStack Router.
export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (to: string) => navigate({ to }),
    replace: (to: string) => navigate({ to, replace: true }),
    back: () => window.history.back(),
    refresh: () => navigate({ to: window.location.pathname + window.location.search }),
  };
}

export function usePathname() {
  return useLocation().pathname;
}

export function redirect(to: string) {
  window.location.assign(to);
  throw new Error('redirect');
}

export function useParams(): Record<string, string> {
  return useParamsTan({ strict: false });
}

