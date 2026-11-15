import { useEffect, useCallback } from 'react';
import ToastProvider from './components/ui/Toast';
import { useHashRoute } from './hooks/useHashRoute';
import { applyBrandColors } from './hooks/useAppInfo';
import Splash from './pages/Splash';
import Login from './pages/Login';
import Launcher from './pages/Launcher';
import WikiPage from './pages/WikiPage';
import AiPage from './pages/AiPage';
import Overlay from './pages/Overlay';

/**
 * Hash router.
 * Launcher window hosts splash / login / launcher shell (sidebar + pages).
 * Overlay, AI and Wiki are separate windows pointed at dedicated routes.
 */
export default function App(): React.JSX.Element {
  const route = useHashRoute();

  useEffect(() => {
    // Brand colors come from app.config.json -> CSS variables.
    void applyBrandColors();
  }, []);

  useEffect(() => {
    document.body.dataset.route = route.replace(/^\//, '') || 'launcher';
  }, [route]);

  const page = (() => {
    switch (route) {
      case '/splash':
        return <Splash />;
      case '/login':
        return <Login />;
      case '/overlay':
        return <Overlay />;
      case '/ai':
        return <AiPage />;
      case '/wiki':
        return <WikiPage />;
      case '/launcher':
        return <Launcher initialPage="home" />;
      default: {
        // nested launcher pages keep the sidebar
        if (route.startsWith('/rules')) return <Launcher initialPage="rules" />;
        if (route.startsWith('/changes')) return <Launcher initialPage="changes" />;
        if (route.startsWith('/settings')) return <Launcher initialPage="settings" />;
        if (route.startsWith('/about')) return <Launcher initialPage="settings" />;
        return <Launcher initialPage="home" />;
      }
    }
  })();

  return <ToastProvider>{page}</ToastProvider>;
}

export function navigate(route: string): void {
  window.location.hash = route;
}

/** Convenience hook for pages that need current hash + navigation. */
export function useNavigation(): { route: string; go: (r: string) => void } {
  const route = useHashRoute();
  const go = useCallback((r: string) => {
    window.location.hash = r;
  }, []);
  return { route, go };
}

// keep eslint happy about unused import style; hook re-exported for pages
export { useHashRoute };
