import React from 'react';
import Icon from '../ui/Icon';
import { assetUrl } from './assets';
import type { PartnerInfo } from '@shared/types';

/**
 * Partner line, reference-style: quiet single line of small caps text with
 * the partner logo. Shown at the bottom of the splash card and the login
 * screen. The logo asset is a placeholder - replace assets/partner-badge.png
 * (path comes from app.config.json -> branding.partner.logoAsset).
 */
export default function PartnerBadge({ partner }: { partner: PartnerInfo }): React.JSX.Element {
  const logoUrl = assetUrl(partner.logoAsset);

  return (
    <div className="partner-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      {logoUrl ? (
        <img className="partner-badge-logo" src={logoUrl} alt="" style={{ opacity: 0.92 }} />
      ) : (
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            background: 'var(--accent-gradient)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#04121F',
            fontWeight: 800,
            fontSize: 10
          }}
        >
          UA
        </span>
      )}
      {!logoUrl && (
        <span
          style={{
            fontSize: 'var(--fs-xs)',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-3)'
          }}
        >
          {partner.label}
        </span>
      )}
      {partner.url ? (
        <button
          className="btn-icon btn btn-ghost no-drag"
          style={{ padding: 4 }}
          onClick={() => void window.api.openExternal(partner.url)}
        >
          <Icon name="external" size={12} />
        </button>
      ) : null}
    </div>
  );
}
