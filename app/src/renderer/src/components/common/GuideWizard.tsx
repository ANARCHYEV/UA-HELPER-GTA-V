import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { assetUrl } from './assets';
import type { AppConfig } from '@shared/types';

/**
 * Step-by-step BYOK wizard (OpenRouter key):
 * 1-3) register / create key / copy it  (with GIF placeholder slots)
 * 4) paste the key into the app  (validated live)
 * 5) pick one of the recommended models or enter any model ID manually.
 */

export default function GuideWizard({
  open,
  onClose,
  config,
  onDone
}: {
  open: boolean;
  onClose: () => void;
  config: AppConfig;
  onDone?: () => void;
}): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [key, setKey] = useState('');
  const [keyState, setKeyState] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [keyError, setKeyError] = useState('');
  const [model, setModel] = useState<string>(config.ai.recommendedModels[0]?.id ?? '');
  const [savingModel, setSavingModel] = useState(false);
  const toast = useToast();

  const steps = config.guide;
  const total = steps.length;
  const progress = Math.round(((step + 1) / total) * 100);

  const checkKey = async (): Promise<void> => {
    setKeyState('checking');
    setKeyError('');
    const res = await window.api.setAiKey(key.trim());
    if (res.ok) {
      setKeyState('ok');
      toast.show('success', 'Ключ збережено та перевірено');
    } else {
      setKeyState('error');
      setKeyError(res.error ?? 'Невідома помилка');
    }
  };

  const applyModel = async (modelId: string): Promise<void> => {
    setSavingModel(true);
    await window.api.patchSettings({ aiModel: modelId });
    setSavingModel(false);
    toast.show('success', 'Модель обрано');
    onDone?.();
    onClose();
    setStep(0);
    setKeyState('idle');
    setKey('');
  };

  const guideAsset = (asset?: string): React.JSX.Element => {
    const url = assetUrl(asset);
    if (!asset) return <></>;
    return (
      <div
        style={{
          position: 'relative',
          height: 180,
          borderRadius: 'var(--radius-m)',
          border: '1px dashed rgba(120,180,255,.35)',
          background: 'rgba(5,11,26,.5)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14
        }}
      >
        {url ? (
          <img
            src={url}
            alt={steps[step]?.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 'var(--fs-s)', color: 'var(--text-3)' }}>
            {asset.replace(/^\.?\//, '')}
          </span>
        )}
        <span
          style={{
            position: 'absolute',
            bottom: 8,
            right: 10,
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-3)'
          }}
        >
          GIF-плейсхолдер: {asset.replace(/^\.?\//, '')}
        </span>
      </div>
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Увімкнути ШІ" width={560}>
      {/* progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 999,
            background: 'rgba(94,117,152,.2)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'var(--accent-gradient)',
              transition: 'width var(--dur-med) var(--ease)'
            }}
          />
        </div>
        <span className="badge">{step + 1}/{total}</span>
      </div>

      {steps[step] && (
        <div className="fade-in" key={step}>
          <h3 style={{ fontSize: 'var(--fs-l)', marginBottom: 8 }}>{steps[step].title}</h3>
          <p style={{ color: 'var(--text-2)', fontSize: 'var(--fs-s)', marginBottom: 14, lineHeight: 1.6 }}>
            {steps[step].text}
          </p>
          {guideAsset(steps[step].asset)}
          {steps[step].link && (
            <Button
              variant="ghost"
              icon="external"
              onClick={() => void window.api.openExternal(steps[step].link as string)}
            >
              Відкрити сайт
            </Button>
          )}
        </div>
      )}

      {/* step 4: key input */}
      {step === 3 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexDirection: 'column' }}>
          <input
            className={`input no-drag ${keyState === 'error' ? 'input-error' : ''}`}
            placeholder="sk-or-v1-..."
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setKeyState('idle');
            }}
            spellCheck={false}
          />
          {keyError && <span style={{ color: 'var(--danger)', fontSize: 'var(--fs-s)' }}>{keyError}</span>}
          {keyState === 'ok' && (
            <span style={{ color: 'var(--success)', fontSize: 'var(--fs-s)' }}>
              Ключ працює. Тепер обери модель.
            </span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" disabled={!key.trim() || keyState === 'checking'} onClick={() => void checkKey()}>
              {keyState === 'checking' ? 'Перевіряю…' : 'Перевірити ключ'}
            </Button>
            <Button variant="ghost" onClick={() => void window.api.openExternal('https://openrouter.ai/keys')}>
              Отримати ключ
            </Button>
          </div>
        </div>
      )}

      {/* step 5: model cards */}
      {step === 4 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {config.ai.recommendedModels.map((m) => (
            <button
              key={m.id}
              className={`card no-drag ${model === m.id ? '' : ''}`}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                borderColor: model === m.id ? 'var(--accent)' : 'var(--glass-border)',
                boxShadow: model === m.id ? 'var(--shadow-accent)' : 'none'
              }}
              onClick={() => setModel(m.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800 }}>
                  {m.titleUk}
                  <span className="badge" style={{ marginLeft: 10 }}>
                    {m.kind === 'fast' ? 'Швидка' : m.kind === 'smart' ? 'Розумна' : 'Збалансована'}
                  </span>
                </span>
                {model === m.id && <Icon name="check" size={16} />}
              </div>
              <div className="card-sub">{m.descriptionUk}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 6 }}>{m.id}</div>
            </button>
          ))}
          <div>
            <span className="card-sub">Або вкажи ID моделі вручну:</span>
            <input
              className="input no-drag"
              style={{ marginTop: 6 }}
              placeholder="provider/model-name"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              spellCheck={false}
            />
          </div>
          <Button
            variant="primary"
            disabled={!model.trim() || keyState !== 'ok' || savingModel}
            onClick={() => void applyModel(model.trim())}
          >
            Готово
          </Button>
        </div>
      )}

      <hr className="divider" />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Назад
        </Button>
        <Button
          variant="ghost"
          disabled={step >= 3 || (step === 3 && keyState !== 'ok')}
          onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
        >
          Далі
        </Button>
      </div>
    </Modal>
  );
}
