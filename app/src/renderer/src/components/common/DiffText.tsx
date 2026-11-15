import React from 'react';

/**
 * Word-level diff renderer for rule changes ("було -> стало").
 * Simple LCS-based diff without external dependencies.
 */

interface Token {
  text: string;
  state: 'same' | 'removed' | 'added';
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

function diffWords(oldText: string, newText: string): Token[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const n = a.length;
  const m = b.length;

  // LCS dynamic programming table (word-level, small texts only)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: Token[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ text: a[i], state: 'same' });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ text: a[i], state: 'removed' });
      i++;
    } else {
      tokens.push({ text: b[j], state: 'added' });
      j++;
    }
  }
  while (i < n) tokens.push({ text: a[i++], state: 'removed' });
  while (j < m) tokens.push({ text: b[j++], state: 'added' });
  return tokens;
}

const STATE_STYLE: Record<Token['state'], React.CSSProperties> = {
  same: {},
  removed: { background: 'rgba(255,92,122,.16)', color: '#ff9fb1', textDecoration: 'line-through' },
  added: { background: 'rgba(45,212,167,.16)', color: '#7ff0c9', textDecoration: 'none' }
};

export default function DiffText({
  oldText,
  newText
}: {
  oldText?: string;
  newText?: string;
}): React.JSX.Element {
  const showPair = oldText !== undefined && newText !== undefined;
  const tokens = showPair ? diffWords(oldText, newText) : [];

  return (
    <div className="selectable" style={{ fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>
      {!showPair && (
        <span style={{ color: newText ? 'var(--text-1)' : 'var(--text-3)' }}>
          {newText ?? '—'}
        </span>
      )}
      {showPair &&
        tokens.map((t, idx) => (
          <span key={idx} style={STATE_STYLE[t.state]}>
            {t.text}
          </span>
        ))}
    </div>
  );
}
