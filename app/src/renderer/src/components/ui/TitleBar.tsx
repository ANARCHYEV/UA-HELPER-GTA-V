import React from 'react';
import Icon from '../ui/Icon';
import Tooltip from '../ui/Tooltip';

/**
 * Custom frameless titlebar with drag region + window controls.
 * pin = always-on-top toggle for the current app windows.
 */
export default function TitleBar({
  title,
  showPin = false,
  showMinimize = true
}: {
  title: string;
  showPin?: boolean;
  showMinimize?: boolean;
}): React.JSX.Element {
  const [pinned, setPinned] = React.useState(false);

  React.useEffect(() => {
    if (showPin) {
      void window.api.getPin().then(setPinned);
    }
  }, [showPin]);

  return (
    <div
      className="drag-region"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 44,
        padding: '0 6px 0 16px',
        background: 'rgba(8, 18, 38, 0.5)',
        borderBottom: '1px solid var(--glass-border)',
        flexShrink: 0
      }}
    >
      <span style={{ fontSize: 'var(--fs-s)', fontWeight: 700, color: 'var(--text-2)' }}>{title}</span>
      <div className="no-drag" style={{ display: 'flex', gap: 2 }}>
        {showPin && (
          <Tooltip text={pinned ? 'Відкріпити вікно' : 'Закріпити вікно поверх'} >
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => void window.api.togglePin().then(setPinned)}
            >
              <Icon name={pinned ? 'pin' : 'pin-off'} size={15} />
            </button>
          </Tooltip>
        )}
        {showMinimize && (
          <button className="btn btn-ghost btn-icon" onClick={() => void window.api.windowControl('minimize')}>
            <Icon name="minimize" size={15} />
          </button>
        )}
        <button
          className="btn btn-ghost btn-icon"
          style={{ color: 'var(--danger)' }}
          onClick={() => void window.api.windowControl('close')}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}
