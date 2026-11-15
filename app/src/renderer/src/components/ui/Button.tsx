import React from 'react';
import Icon, { type IconName } from './Icon';

/** Button on top of the global .btn styles. */
export default function Button({
  variant = 'default',
  size = 'm',
  icon,
  children,
  className = '',
  ...rest
}: {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 's' | 'm';
  icon?: IconName;
  children?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  const variantClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'ghost'
        ? 'btn-ghost'
        : variant === 'danger'
          ? 'btn-danger'
          : '';
  const sizeClass = size === 's' ? 'btn-s' : '';
  return (
    <button className={`btn ${variantClass} ${sizeClass} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 's' ? 14 : 16} />}
      {children}
    </button>
  );
}
