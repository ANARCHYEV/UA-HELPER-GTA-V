import uk from './uk.json';

/**
 * Tiny i18n helper. v1 ships Ukrainian only (config-driven for future langs).
 * The dictionary is nested ("login": { "tgStart": "..." }), keys are dot
 * paths ("login.tgStart"). Missing keys render as the key itself so nothing
 * silently disappears.
 */
type DictNode = string | { [k: string]: DictNode };

const dict = uk as unknown as DictNode;

/** Walks the nested dictionary along a dot path; returns the key on miss. */
function resolve(key: string): string {
  let node: DictNode = dict;
  for (const part of key.split('.')) {
    if (typeof node === 'string' || !(part in node)) return key;
    node = node[part];
  }
  return typeof node === 'string' ? node : key;
}

export function t(key: string): string {
  return resolve(key);
}

export function tFormat(key: string, values: Record<string, string | number>): string {
  let text = resolve(key);
  for (const [k, v] of Object.entries(values)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
}
