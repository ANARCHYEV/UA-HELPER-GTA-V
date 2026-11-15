import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { IPC_EVENTS } from '@shared/ipc-channels';

/** Lightweight toast system: ToastProvider + useToast hook. */

type ToastKind = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => undefined });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const KIND_CLASS: Record<ToastKind, string> = {
  info: '',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-danger'
};

export default function ToastProvider({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  // Toasts pushed from the main process (e.g. blocked external links).
  useEffect(() => {
    const off = window.api.on(IPC_EVENTS.ToastPush, (...args: unknown[]) => {
      const payload = args[0] as { type?: ToastKind; message?: string } | undefined;
      if (payload?.message) {
        show(payload.type ?? 'info', payload.message);
      }
    });
    return () => {
      off();
    };
  }, [show]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 18,
          right: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 1000
        }}
      >
        {items.map((t) => (
          <div key={t.id} className={`glass fade-in ${KIND_CLASS[t.kind]}`} style={{ padding: '10px 16px', maxWidth: 340, fontSize: 'var(--fs-s)' }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
