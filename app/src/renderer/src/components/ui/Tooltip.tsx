import React from 'react';

/** Minimal Tooltip on hover. */
export default function Tooltip({
  text,
  children
}: {
  text: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [visible, setVisible] = React.useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          className="glass"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 10px',
            fontSize: 'var(--fs-xs)',
            whiteSpace: 'nowrap',
            zIndex: 800,
            pointerEvents: 'none'
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
