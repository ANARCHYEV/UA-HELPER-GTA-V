import React, { useEffect, useRef } from 'react';

/**
 * Layered animated scene behind every screen:
 *   1. deep vertical gradient (base night sky),
 *   2. two slow drifting aurora glows tinted with the brand accents,
 *   3. thin "topographic" contour lines wandering horizontally,
 *   4. soft vignette to focus the center.
 *
 * GPU-friendly: one canvas, throttled to ~30fps, few paths; renders a
 * single static frame when prefers-reduced-motion is set.
 *
 * Brand colors are read from CSS variables, so app.config.json accents
 * restyle the whole scene without touching this file.
 */

interface Aurora {
  /** relative x/y of the glow center (0..1 of canvas size) */
  cx: number;
  cy: number;
  /** radius relative to canvas width */
  r: number;
  /** rgb triple for the gradient stops */
  rgb: [number, number, number];
  alpha: number;
  /** drift speed/period multipliers */
  driftX: number;
  driftY: number;
  period: number;
}

export default function AnimatedBackground({
  density = 16,
  speed = 0.4
}: {
  density?: number;
  speed?: number;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let t = Math.PI * 3; // offset so the first frame already looks composed
    let width = 0;
    let height = 0;

    const cssAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    const cssAccent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent-2');

    function hexToRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
      const m = hex.trim().replace('#', '');
      if (m.length !== 6) return fallback;
      const r = parseInt(m.slice(0, 2), 16);
      const g = parseInt(m.slice(2, 4), 16);
      const b = parseInt(m.slice(4, 6), 16);
      return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
        ? [r, g, b]
        : fallback;
    }

    const accentRgb = hexToRgb(cssAccent, [0, 168, 255]);
    const accent2Rgb = hexToRgb(cssAccent2, [34, 211, 238]);

    const auroras: Aurora[] = [
      // brand glow, upper-left area
      { cx: 0.28, cy: 0.24, r: 0.5, rgb: accentRgb, alpha: 0.035, driftX: 0.06, driftY: 0.04, period: 17 },
      // secondary cyan glow, lower-right area
      { cx: 0.76, cy: 0.82, r: 0.55, rgb: accent2Rgb, alpha: 0.025, driftX: -0.05, driftY: -0.035, period: 23 },
      // deep indigo anchor at the bottom
      { cx: 0.5, cy: 1.05, r: 0.65, rgb: [30, 58, 138], alpha: 0.035, driftX: 0.03, driftY: 0.01, period: 29 }
    ];

    const resize = (): void => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (): void => {
      // 1. base night gradient
      const base = ctx.createLinearGradient(0, 0, 0, height);
      base.addColorStop(0, '#101116');
      base.addColorStop(0.55, '#111218');
      base.addColorStop(1, '#15171e');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);

      // 2. aurora glows (slow drifting radial gradients)
      for (const a of auroras) {
        const cx = (a.cx + Math.sin(t / a.period) * a.driftX) * width;
        const cy = (a.cy + Math.cos(t / a.period * 1.3) * a.driftY) * height;
        const radius = a.r * Math.max(width, height);
        const breathe = 1 + 0.08 * Math.sin(t / (a.period * 0.7));
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * breathe);
        const [r, g, b] = a.rgb;
        grad.addColorStop(0, `rgba(${r},${g},${b},${a.alpha})`);
        grad.addColorStop(0.55, `rgba(${r},${g},${b},${a.alpha * 0.35})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // 3. topographic contour lines
      const lines = Math.max(8, density);
      for (let i = 0; i < lines; i++) {
        const p = i / lines;
        const yBase = height * (0.08 + 0.84 * p);
        const amp = 12 + 22 * Math.sin(p * Math.PI);
        const phase = t * speed * 0.5 + i * 0.8;

        ctx.beginPath();
        for (let x = -24; x <= width + 24; x += 12) {
          const y =
            yBase +
            Math.sin(x / 150 + phase) * amp +
            Math.sin(x / 360 - phase * 0.6) * amp * 0.55;
          if (x === -24) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        // fade lines out towards top and bottom edges
        const edgeFade = Math.min(1, Math.min(p, 1 - p) * 3.2);
        const alpha = (0.025 + 0.035 * (1 - Math.abs(p - 0.5))) * edgeFade;
        ctx.strokeStyle = i % 3 === 0 ? cssAccent.trim() || '#00A8FF' : '#E6F1FF';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 4. vignette
      const vg = ctx.createRadialGradient(
        width / 2,
        height * 0.46,
        Math.min(width, height) * 0.35,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.75
      );
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(2,3,8,0.4)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);
    };

    if (reduced) {
      draw();
    } else {
      let last = 0;
      const frame = (now: number): void => {
        if (now - last >= 33) {
          last = now;
          t += 0.033;
          draw();
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, [density, speed]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none'
      }}
    />
  );
}
