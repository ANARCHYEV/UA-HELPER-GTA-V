import type { Api } from '@shared/types';

declare global {
  interface Window {
    api: Api;
  }
}

export {};

// Wildcard asset module declarations live in assets.d.ts (ambient, global).
