import partnerBadge from '../../assets/partner-badge.png';
import guideStep1 from '../../assets/guide/step-1.svg';
import guideStep2 from '../../assets/guide/step-2.svg';
import guideStep3 from '../../assets/guide/step-3.svg';
import guideStep4 from '../../assets/guide/step-4.svg';
import guideStep5 from '../../assets/guide/step-5.svg';

/**
 * Static asset map keyed by config-declared paths (app.config.json).
 * Config references assets by their repo-relative name, e.g.
 * './partner-badge.png' or './guide/step-1.svg'.
 *
 * Static imports let Vite bundle the files (hash + copy into out/renderer),
 * so URLs resolve identically in dev and production builds.
 */
const ASSET_MAP: Record<string, string> = {
  'partner-badge.png': partnerBadge,
  'guide/step-1.svg': guideStep1,
  'guide/step-2.svg': guideStep2,
  'guide/step-3.svg': guideStep3,
  'guide/step-4.svg': guideStep4,
  'guide/step-5.svg': guideStep5
};

/** Resolves a config asset path to a bundled URL, or null when unknown. */
export function assetUrl(path: string | undefined): string | null {
  if (!path) return null;
  return ASSET_MAP[path.replace(/^\.?\//, '')] ?? null;
}
