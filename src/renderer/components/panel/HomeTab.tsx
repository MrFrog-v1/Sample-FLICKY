import type { FlickySettings, VoiceState, MemoryStats } from '../../../shared/types';
import { Waveform } from '../Waveform';
import { Tour } from './Tour';

interface HomeTabProps {
  voiceState: VoiceState;
  settings: FlickySettings;
  memory: MemoryStats | null;
  onNavigate: (tab: 'chats' | 'mind' | 'voice' | 'ear' | 'general') => void;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function HomeTab({ voiceState, settings, memory, onNavigate }: HomeTabProps) {
  const { apiKeyStatus } = settings;
  const mindReady =
    settings.mindProvider === 'gemini'
      ? apiKeyStatus.gemini
      : settings.mindProvider === 'openrouter'
        ? apiKeyStatus.openrouter
        : apiKeyStatus.groq;
  const earReady = apiKeyStatus.groq;
  const voiceReady = apiKeyStatus.elevenlabs;

  // It is ready if all required components are configured
  const ready = mindReady && earReady && voiceReady;
  const connectedCount = [mindReady, earReady, voiceReady].filter(Boolean).length;
  const totalRequired = 3; // Mind (VLM), Ear (Groq STT), Voice (ElevenLabs)

  const modelLabel =
    settings.mindProvider === 'gemini'
      ? 'Gemini 3.5 Flash'
      : settings.mindProvider === 'openrouter'
        ? 'Gemma 4 31B (Free)'
        : 'Llama 4 Scout 17B';

  const pct = memory ? Math.round((memory.tokens / memory.tokenBudget) * 100) : 0;

  const shortcutKeys = settings.pushToTalkShortcut.split('+').filter(Boolean);

  return (
    <>
      <h1 className="main-h1">
        Welcome back<em>.</em>
      </h1>
      <p className="main-lead">
        {ready
          ? 'Hold the push-to-talk shortcut from anywhere and Flicky will listen, think, and reply.'
          : `${connectedCount} of ${totalRequired} providers connected. Add the remaining keys to start talking.`}
      </p>

      <div className="home-hero">
        <div className="home-wave-wrap">
          <Waveform state={ready ? voiceState : 'idle'} bars={23} height={72} />
          {ready ? (
            <div className="home-ptt">
              hold{' '}
              {shortcutKeys.map((k, i) => (
                <kbd key={`${k}-${i}`}>{k}</kbd>
              ))}{' '}
              to talk
            </div>
          ) : (
            <div className="home-ptt blocked">add the missing key to start talking</div>
          )}
        </div>
        <div className="home-status">
          <div className="status-chip">
            <div
              className={`dot ${
                voiceState === 'listening' || voiceState === 'responding'
                  ? 'active'
                  : ready
                    ? ''
                    : 'warn'
              }`}
            />
            <div style={{ flex: 1 }}>
              <div className="t">
                {voiceState === 'listening'
                  ? 'Listening'
                  : voiceState === 'processing'
                    ? 'Thinking'
                    : voiceState === 'responding'
                      ? 'Responding'
                      : ready
                        ? 'Ready'
                        : 'Setup needed'}
              </div>
              <div className="s">{ready ? 'all providers connected' : `${connectedCount} of ${totalRequired} connected`}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Memory</div>
          <div className="stat-value">{formatTokens(memory?.tokens ?? 0)}</div>
          <div className="stat-sub">of {formatTokens(memory?.tokenBudget ?? 250_000)} tokens ({pct}%)</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Model</div>
          <div className="stat-value" style={{ fontSize: 22, lineHeight: 1.15 }}>{modelLabel}</div>
          <div className="stat-sub">
            via {settings.mindProvider === 'gemini' ? 'Google AI' : settings.mindProvider === 'openrouter' ? 'OpenRouter' : 'Groq'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Messages</div>
          <div className="stat-value">{memory?.messageCount ?? 0}</div>
          <div className="stat-sub">
            {memory?.summarizedCount
              ? `${memory.summarizedCount} summarized`
              : 'in this session'}
          </div>
        </div>
      </div>

      <div className="provider-summary">
        <h3>Connected providers</h3>
        {settings.mindProvider === 'gemini' && (
          <div className="provider-row">
            <div className="provider-logo gemini">G</div>
            <div className="nm">
              Gemini <span className="purpose" style={{ marginLeft: 6 }}>· reasoning (Mind)</span>
            </div>
            {apiKeyStatus.gemini ? (
              <span className="pill-saved">Connected</span>
            ) : (
              <button className="goto" onClick={() => onNavigate('mind')}>Add key →</button>
            )}
          </div>
        )}
        {settings.mindProvider === 'openrouter' && (
          <div className="provider-row">
            <div className="provider-logo openrouter">O</div>
            <div className="nm">
              OpenRouter <span className="purpose" style={{ marginLeft: 6 }}>· reasoning (Mind)</span>
            </div>
            {apiKeyStatus.openrouter ? (
              <span className="pill-saved">Connected</span>
            ) : (
              <button className="goto" onClick={() => onNavigate('mind')}>Add key →</button>
            )}
          </div>
        )}
        <div className="provider-row">
          <div className="provider-logo groq">G</div>
          <div className="nm">
            Groq <span className="purpose" style={{ marginLeft: 6 }}>
              {settings.mindProvider === 'groq' ? '· reasoning + transcription' : '· voice transcription (Ear)'}
            </span>
          </div>
          {apiKeyStatus.groq ? (
            <span className="pill-saved">Connected</span>
          ) : (
            <button className="goto" onClick={() => settings.mindProvider === 'groq' ? onNavigate('mind') : onNavigate('ear')}>
              Add key →
            </button>
          )}
        </div>
        <div className="provider-row">
          <div className="provider-logo eleven">11</div>
          <div className="nm">
            ElevenLabs <span className="purpose" style={{ marginLeft: 6 }}>· voice</span>
          </div>
          {apiKeyStatus.elevenlabs ? (
            <span className="pill-saved">Connected</span>
          ) : (
            <button className="goto" onClick={() => onNavigate('voice')}>Add key →</button>
          )}
        </div>
      </div>

      <Tour shortcut={settings.pushToTalkShortcut} onNavigate={onNavigate} />
    </>
  );
}
