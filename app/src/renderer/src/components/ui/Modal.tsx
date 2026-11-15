import React from 'react';

/** Modal with backdrop + glass panel. Closes on backdrop click and Escape. */
export default function Modal({
  open,
  onClose,
  title,
  children,
  width = 520
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: number;
}): React.JSX.Element | null {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 16, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 900
      }}
      onClick={onClose}
    >
      <div
        className="glass fade-in"
        style={{ width, maxHeight: '86vh', overflow: 'auto', padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 style={{ fontSize: 'var(--fs-l)', marginBottom: 14 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
