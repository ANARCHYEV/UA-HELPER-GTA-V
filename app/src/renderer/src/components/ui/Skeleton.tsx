import React from 'react';

/** Loading placeholder block. */
export default function Skeleton({
  height = 60,
  width = '100%'
}: {
  height?: number | string;
  width?: number | string;
}): React.JSX.Element {
  return <div className="skeleton" style={{ height, width }} />;
}
