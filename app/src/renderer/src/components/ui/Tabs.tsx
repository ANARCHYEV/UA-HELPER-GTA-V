import React from 'react';

/** Tabs component with underline animation. */
export interface TabItem {
  id: string;
  label: string;
}

export default function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`tab no-drag ${active === t.id ? 'is-active' : ''}`}
          type="button"
          role="tab"
          aria-selected={active === t.id}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
