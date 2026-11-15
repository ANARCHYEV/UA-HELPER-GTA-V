import { useEffect, useState } from 'react';

/** Minimal hash-based router (no extra dependency). */
export function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, '') || '/splash');

  useEffect(() => {
    const onChange = () => {
      setRoute(window.location.hash.replace(/^#/, '') || '/splash');
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
