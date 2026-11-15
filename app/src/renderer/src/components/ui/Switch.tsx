import React from 'react';

/** iOS-style switch. */
export default function Switch({
  checked,
  onChange,
  disabled
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="no-drag"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        border: '1px solid var(--glass-border)',
        background: checked ? 'var(--accent-gradient)' : 'var(--bg-2)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background var(--dur-fast) var(--ease)',
        opacity: disabled ? 0.45 : 1
      }}
      aria-pressed={checked}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: '#fff',
          transition: 'left var(--dur-fast) var(--ease)'
        }}
      />
    </button>
  );
}
