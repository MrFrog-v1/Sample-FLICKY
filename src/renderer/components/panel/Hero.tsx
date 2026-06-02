import type { FlickySettings, VoiceState } from '../../../shared/types';
import { Waveform } from '../Waveform';

interface HeroProps {
  voiceState: VoiceState;
  settings: FlickySettings;
}

export function Hero({ voiceState, settings }: HeroProps) {
  const { apiKeyStatus } = settings;
  const requiredKeys = ['elevenlabs', 'groq'];
  if (settings.mindProvider === 'openrouter') requiredKeys.push('openrouter');
  if (settings.mindProvider === 'gemini') requiredKeys.push('gemini');

  const connectedCount = requiredKeys.filter(
    (k) => apiKeyStatus[k as keyof typeof apiKeyStatus],
  ).length;
  const totalRequired = requiredKeys.length;

  const isMindReady =
    settings.mindProvider === 'openrouter'
      ? apiKeyStatus.openrouter
      : settings.mindProvider === 'gemini'
        ? apiKeyStatus.gemini
        : apiKeyStatus.groq;
  const isEarReady = apiKeyStatus.groq;
  const ready = apiKeyStatus.elevenlabs && isMindReady && isEarReady;

  let stateLabel: string;
  let stateClass = '';
  if (voiceState === 'listening') {
    stateLabel = 'Listening';
    stateClass = 'listening';
  } else if (voiceState === 'processing') {
    stateLabel = 'Thinking';
  } else if (voiceState === 'responding') {
    stateLabel = 'Responding';
  } else if (!ready) {
    stateLabel = `Setup · ${connectedCount} of ${totalRequired}`;
    stateClass = 'setup';
  } else {
    stateLabel = 'Ready';
  }

  return (
    <div className="hero">
      <div className="hero-top">
        <div className="logo">F</div>
        <div>
          <div className="brand-name">Flicky</div>
          <div className="brand-sub">your voice companion</div>
        </div>
        <div className={`state ${stateClass}`}>{stateLabel}</div>
      </div>
      <Waveform state={ready ? voiceState : 'idle'} />
      {ready ? (
        <div className="hero-ptt">
          hold <kbd>Ctrl</kbd>
          <kbd>Alt</kbd>
          <kbd>X</kbd> to talk
        </div>
      ) : (
        <div className="hero-ptt blocked">
          {totalRequired - connectedCount === 1
            ? 'one more key needed to start talking'
            : `add ${totalRequired - connectedCount} keys to start talking`}
        </div>
      )}
    </div>
  );
}
