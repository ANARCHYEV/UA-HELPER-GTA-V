import React, { useEffect, useState } from 'react';

/**
 * Hotkey capture field: click "Record" and press a key combination;
 * builds an Electron accelerator string (e.g. CommandOrControl+Shift+H).
 * Applies immediately through the callback provided by the parent.
 */

const SPECIAL_KEYS = [
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'Insert','Delete','Home','End','PageUp','PageDown','Tab','Backspace','Enter'
];

function keyToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('CommandOrControl');
  if (e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let key = e.key;
  if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return null;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  else if (!SPECIAL_KEYS.includes(key)) return null;

  parts.push(key);
  return parts.join('+');
}

export default function HotkeyCapture({
  value,
  onApply
}: {
  value: string;
  onApply: (accelerator: string) => Promise<boolean>;
}): React.JSX.Element {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(false);
        return;
      }
      const acc = keyToAccelerator(e);
      if (acc) {
        setRecording(false);
        setBusy(true);
        void onApply(acc).then((ok) => {
          setBusy(false);
          if (!ok) setRecording(false);
        });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);

  const displayValue = (accelerator: string): string => accelerator
    .replaceAll('CommandOrControl', 'Ctrl')
    .split('+')
    .join(' + ');

  return (
    <div className="hotkey-capture">
      <output className="input hotkey-capture-value" aria-live="polite">
        {recording ? 'Натисніть комбінацію…' : displayValue(value)}
      </output>
      <button
        className={`btn btn-s no-drag ${recording ? 'btn-danger' : ''}`}
        onClick={() => {
          setRecording((r) => !r);
        }}
        disabled={busy}
      >
        {recording ? 'Скасувати' : busy ? 'Зберігаємо…' : 'Змінити'}
      </button>
    </div>
  );
}
