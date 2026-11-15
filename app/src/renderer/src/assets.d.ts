// Ambient declarations for static asset imports (bundled by Vite).
// Must stay a module-free file so the wildcards are global.

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.svg?raw' {
  const source: string;
  export default source;
}

declare module '*.webp' {
  const src: string;
  export default src;
}
