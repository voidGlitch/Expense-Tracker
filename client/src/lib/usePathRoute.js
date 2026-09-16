/**
 * A path-based router using the History API — gives clean URLs like /expenses
 * instead of hash routes like #/expenses. Works with the server's SPA fallback.
 *
 * On mount, if the URL still has a hash fragment (e.g. /#/bills from old links),
 * we silently redirect to the equivalent path (/bills) and discard the hash.
 */
import { useEffect, useState } from 'react';

const VALID_ROUTES = ['dashboard', 'expenses', 'bills', 'savings', 'splitwise', 'history', 'settings'];

const read = () => {
  const path = window.location.pathname;
  const segment = path.replace(/^\/+/, '').split('/')[0] || 'dashboard';
  return VALID_ROUTES.includes(segment) ? segment : 'dashboard';
};

/** Migrate any lingering hash route (/#/bills) to a real path (/bills). */
const migrateHashIfNeeded = () => {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (!hash || !VALID_ROUTES.includes(hash)) return;
  const target = hash === 'dashboard' ? '/' : `/${hash}`;
  window.history.replaceState(null, '', target);
};

export function usePathRoute() {
  const [route, setRoute] = useState(read);

  useEffect(() => {
    // Redirect any old hash routes on first load
    migrateHashIfNeeded();
    setRoute(read());

    const onPopState = () => setRoute(read());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (next) => {
    if (read() === next) return;
    const path = next === 'dashboard' ? '/' : `/${next}`;
    window.history.pushState(null, '', path);
    setRoute(next);
  };

  return [route, navigate];
}