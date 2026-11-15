import React from 'react';

/** Badge chip. `active` highlights it as a selected filter. */
export default function Badge({
  label,
  onClick,
  active,
  variant
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  variant?: 'success' | 'warning' | 'danger' | 'muted';
}): React.JSX.Element {
  const variantClass =
    variant === 'success'
      ? 'badge-success'
      : variant === 'warning'
        ? 'badge-warning'
        : variant === 'danger'
          ? 'badge-danger'
          : variant === 'muted'
            ? 'badge-muted'
            : '';

  const style: React.CSSProperties = onClick
    ? { cursor: 'pointer', border: '1px solid transparent' }
    : {};

  if (active) {
    style.borderColor = 'var(--accent)';
    style.boxShadow = '0 0 0 2px var(--accent-soft)';
  }

  return (
    <span className={`badge ${variantClass}${active ? ' is-active' : ''}`} style={style} onClick={onClick}>
      {label}
    </span>
  );
}
