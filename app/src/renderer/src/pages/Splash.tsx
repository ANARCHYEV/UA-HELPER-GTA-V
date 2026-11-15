import React, { useEffect, useRef, useState } from 'react';
import { navigate } from '../App';
import PartnerBadge from '../components/common/PartnerBadge';
import TopographicPattern from '../components/common/TopographicPattern';
import Icon from '../components/ui/Icon';
import { loadAppInfo } from '../hooks/useAppInfo';
import { IPC_EVENTS } from '@shared/ipc-channels';
import type { AppConfig, AppSettings, UpdateState } from '@shared/types';
import { t, tFormat } from '../i18n';
import splashLogo from '../assets/splash-logo.png';

/**
 * Splash screen (reference-style hero card).
 *
 * A big charcoal card floats over the animated aurora/contour scene.
 * Inside: logo wordmark, rotating status phrase, a long REAL boot
 * checklist (each step performs an actual IPC call - updates check,
 * rules & laws sync, knowledge base, hotkeys, profile), a progress
 * bar with a creeping fill and the partner line at the bottom.
 *
 * Every step has a minimum display time, so the sequence always reads
 * deliberately (~6-8s online, longer while syncing) and never flashes.
 */

interface Stage {
  labelKey: string;
  /** guaranteed on-screen time, keeps the sequence readable */
  minMs: number;
  /** runs the real work; returns the right-side detail text */
  run: () => Promise<{ detail?: string; warn?: string } | void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Startup must stay usable offline: optional calls never get to hold the splash forever. */
async function finishWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('startup task timeout')), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function isUpdateState(value: unknown): value is UpdateState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof (value as { status: unknown }).status === 'string'
  );
}

export default function Splash(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [progress, setProgress] = useState(2);
  const [leaving, setLeaving] = useState(false);

  const started = useRef(false);
  const progressTarget = useRef(2);
  const latestUpdate = useRef<UpdateState | null>(null);

  /* ------------------------------------------------------------- */
  /* Progress creep: display value chases the milestone target     */
  /* ------------------------------------------------------------- */
  useEffect(() => {
    const id = window.setInterval(() => {
      setProgress((p) => {
        const target = progressTarget.current;
        if (p >= target) return p;
        const next = p + Math.max(0.12, (target - p) * 0.07);
        return Math.min(next, target);
      });
    }, 90);
    return () => window.clearInterval(id);
  }, []);

  /* ------------------------------------------------------------- */
  /* Update events (may arrive while the splash is visible)         */
  /* ------------------------------------------------------------- */
  useEffect(() => {
    const off = window.api.on(IPC_EVENTS.UpdatesState, (...args: unknown[]) => {
      if (isUpdateState(args[0])) {
        latestUpdate.current = args[0];
      }
    });
    return () => {
      off();
    };
  }, []);

  /* ------------------------------------------------------------- */
  /* Boot sequence                                                  */
  /* ------------------------------------------------------------- */
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    /** Waits until the update check leaves the transient states (or times out). */
    const settleUpdate = async (initial: UpdateState, timeoutMs: number): Promise<UpdateState> => {
      if (initial.status !== 'checking' && initial.status !== 'idle') return initial;
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeoutMs) {
        await sleep(140);
        const s = latestUpdate.current;
        if (s && s.status !== 'checking' && s.status !== 'idle') return s;
      }
      return latestUpdate.current ?? initial;
    };

    let settings: AppSettings | null = null;
    let targetRoute = '/login';

    const stages: Stage[] = [
      // 1. Core init: config + settings
      {
        labelKey: 'splash.stInit',
        minMs: 800,
        run: async () => {
          const info = await window.api.getInfo();
          setConfig(info.config);
          settings = await window.api.getSettings();
          return;
        }
      },
      // 2. Updates check (real electron-updater query)
      {
        labelKey: 'splash.stUpdates',
        minMs: 1000,
        run: async () => {
          if (!settings?.checkUpdatesOnStart) {
            return { detail: t('splash.updatesOff') };
          }
          const state = await settleUpdate(await window.api.checkUpdates(), 4000);
          if (state.status === 'not-available') return { detail: t('splash.updatesNone') };
          if (state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded') {
            return { detail: tFormat('splash.updatesNew', { version: state.version ?? '' }) };
          }
          if (state.status === 'error') return { warn: t('splash.updatesErr') };
          return { detail: t('splash.updatesNone') };
        }
      },
      // 3. Rules & laws sync (server or offline cache)
      {
        labelKey: 'splash.stSync',
        minMs: 1100,
        run: async () => {
          const result = await window.api.syncRules();
          return result.ok && result.source === 'server'
            ? { detail: t('splash.serverOk') }
            : { warn: t('splash.offlineCache') };
        }
      },
      // 4. AI knowledge base (sections & laws counts)
      {
        labelKey: 'splash.stKnowledge',
        minMs: 900,
        run: async () => {
          const [sections, laws] = await Promise.all([
            window.api.getRuleSections(),
            window.api.getLaws()
          ]);
          if (sections.length === 0 && laws.length === 0) return { warn: t('splash.kbEmpty') };
          return {
            detail: tFormat('splash.sectionsLaws', { sections: sections.length, laws: laws.length })
          };
        }
      },
      // 5. Global hotkeys
      {
        labelKey: 'splash.stHotkeys',
        minMs: 700,
        run: async () => {
          const hotkeys = await window.api.getHotkeys();
          return { detail: hotkeys.overlay };
        }
      },
      // 6. Player profile (decides the next route)
      {
        labelKey: 'splash.stProfile',
        minMs: 700,
        run: async () => {
          const profile = await window.api.getProfile();
          if (profile && profile.authMode !== 'local') {
            targetRoute = '/launcher';
            return { detail: profile.nickname };
          }
          if (profile?.authMode === 'local') await window.api.logout();
          return { detail: t('splash.guest') };
        }
      },
      // 7. Finishing touches
      {
        labelKey: 'splash.stFinish',
        minMs: 900,
        run: async () => ({ detail: t('splash.ready') })
      }
    ];

    void (async () => {
      // warm up the config for the header as soon as possible
      void loadAppInfo().then((info) => {
        setConfig((prev) => prev ?? info.config);
      });

      for (let i = 0; i < stages.length; i++) {
        progressTarget.current = Math.round((i / stages.length) * 100) + 6;

        const startedAt = performance.now();
        try {
          await finishWithin(stages[i].run(), 4500);
        } catch {
          // A failed optional startup task must never block the launcher.
        }

        const elapsed = performance.now() - startedAt;
        const remaining = stages[i].minMs - elapsed;
        if (remaining > 0) await sleep(remaining);

        progressTarget.current = Math.round(((i + 1) / stages.length) * 100);
        await sleep(120);
      }

      progressTarget.current = 100;
      setProgress(100);
      await sleep(560);
      setLeaving(true);
      await sleep(300);
      await window.api.completeSplash();
      navigate(targetRoute);
    })();
  }, []);

  /* ------------------------------------------------------------- */
  /* Render                                                         */
  /* ------------------------------------------------------------- */
  return (
    <div className="splash-clean-root">
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          className={`splash-card card-in${leaving ? ' card-out' : ''}`}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 'none',
            padding: '38px 44px 26px',
            borderRadius: 'var(--radius-l)',
            background: 'linear-gradient(180deg, var(--surface-card-1), var(--surface-card-2))',
            border: '1px solid var(--card-border)',
            boxShadow: 'var(--shadow-xl), inset 0 1px 0 var(--card-highlight)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <button
            type="button"
            className="splash-close no-drag"
            aria-label="Сховати програму"
            title="Сховати програму"
            onClick={() => void window.api.windowControl('close')}
          >
            <Icon name="close" size={17} />
          </button>
          <TopographicPattern className="splash-topographic" />

          <div className="splash-brand" style={{ position: 'relative', textAlign: 'center' }}>
            <img className="splash-logo" src={splashLogo} alt="UA Helper" />
          </div>

          <h1 className="splash-stage">Завантажуємо додаток…</h1>

          {/* progress bar */}
          <div className="splash-progress" style={{ width: '100%', marginTop: 22 }}>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: 'var(--track)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: `${Math.min(100, Math.max(0, progress))}%`,
                  height: '100%',
                  background: 'var(--accent-gradient)',
                  transition: 'width 480ms var(--ease)'
                }}
              >
                <div className="bar-shine" style={{ position: 'absolute', inset: 0 }} />
              </div>
            </div>
            <span className="splash-file-status">Оновлюємо дані…</span>
          </div>

          <div
            className="splash-footer"
            style={{
              marginTop: 22,
              paddingTop: 14,
              borderTop: '1px solid rgba(230, 241, 255, 0.06)',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}
          >
            <PartnerBadge
              partner={config?.branding.partner ?? { label: t('partner.default'), logoAsset: '', url: '' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
