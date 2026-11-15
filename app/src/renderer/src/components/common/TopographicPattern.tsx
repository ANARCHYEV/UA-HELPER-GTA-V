import React, { useMemo } from 'react';
import topographicSource from '../../assets/topographic.svg?raw';

/**
 * Bundled user-supplied SVG contour map. The path animation stays inside the
 * SVG document so it remains GPU-friendly and works identically in splash and
 * launcher surfaces.
 */
export default function TopographicPattern({ className = '' }: { className?: string }): React.JSX.Element {
  const markup = useMemo(
    () =>
      topographicSource
        .replace('<svg ', '<svg class="ua-topographic-svg" ')
        .replace(
          '<g>',
          `<style>
            .ua-topographic-svg path {
              fill: none !important;
              stroke: currentColor !important;
              stroke-width: 1.15 !important;
              stroke-dasharray: 280 720;
              stroke-dashoffset: 1000;
              animation: ua-topographic-flow 10s linear infinite;
            }
            .ua-topographic-svg path:nth-of-type(3n + 1) { animation-delay: -3.3s; }
            .ua-topographic-svg path:nth-of-type(3n + 2) { animation-delay: -6.6s; }
            @keyframes ua-topographic-flow { to { stroke-dashoffset: 0; } }
            @media (prefers-reduced-motion: reduce) { .ua-topographic-svg path { animation: none; stroke-dashoffset: 0; } }
          </style><g>`
        ),
    []
  );

  return <div className={`topographic-pattern ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}
