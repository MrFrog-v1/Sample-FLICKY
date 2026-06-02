import type {
  FlickySettings,
  ReasoningDepth,
  ReplyTone,
} from '../../../shared/types';
import { ProviderKey } from './ProviderKey';

interface MindTabProps {
  settings: FlickySettings;
}

export function MindTab({ settings }: MindTabProps) {
  const setTone = (t: ReplyTone) => window.flicky.setReplyTone(t);
  const setDepth = (d: ReasoningDepth) => window.flicky.setReasoningDepth(d);

  return (
    <>
      <h1 className="main-h1">
        Mind<em>.</em>
      </h1>
      <p className="main-lead">
        How Flicky thinks — choose your reasoning provider.
      </p>

      <div className="section">
        <div className="section-title">Reasoning provider</div>
        <div className="seg" style={{ marginBottom: 16 }}>
          <button
            className={settings.mindProvider === 'gemini' ? 'on' : ''}
            onClick={() => window.flicky.setMindProvider('gemini')}
          >
            Gemini
          </button>
          <button
            className={settings.mindProvider === 'groq' ? 'on' : ''}
            onClick={() => window.flicky.setMindProvider('groq')}
          >
            Groq
          </button>
          <button
            className={settings.mindProvider === 'openrouter' ? 'on' : ''}
            onClick={() => window.flicky.setMindProvider('openrouter')}
          >
            OpenRouter
          </button>
        </div>

        {settings.mindProvider === 'gemini' ? (
          <>
            <ProviderKey
              name="gemini"
              providerLabel="Gemini"
              providerLogo="G"
              providerLogoClass="gemini"
              isSet={settings.apiKeyStatus.gemini}
              keyPlaceholder="AIza..."
              hideProviderHeader
            />
            <p className="section-hint">
              Powered by Gemini 2.5 Flash — free tier with excellent vision. Get a key at{' '}
              <a href="#" onClick={() => window.flicky.openExternal('https://aistudio.google.com/apikey')}>
                Google AI Studio
              </a>.
            </p>
          </>
        ) : settings.mindProvider === 'groq' ? (
          <>
            <ProviderKey
              name="groq"
              providerLabel="Groq"
              providerLogo="G"
              providerLogoClass="groq"
              isSet={settings.apiKeyStatus.groq}
              keyPlaceholder="gsk_..."
              hideProviderHeader
            />
            <p className="section-hint">
              Powers reasoning and voice transcription (Whisper). One key for both.
            </p>
          </>
        ) : (
          <>
            <ProviderKey
              name="openrouter"
              providerLabel="OpenRouter"
              providerLogo="O"
              providerLogoClass="openrouter"
              isSet={settings.apiKeyStatus.openrouter}
              keyPlaceholder="sk-or-v1-..."
              hideProviderHeader
            />
            <p className="section-hint">
              Powers reasoning. Groq is still used for voice transcription.
            </p>
          </>
        )}
      </div>


      <div className="section">
        <div className="section-title" style={{ marginBottom: 6 }}>Reasoning depth</div>
        <p className="section-hint" style={{ margin: '0 0 14px' }}>
          How much Flicky thinks before replying.
        </p>
        <div className="seg">
          <button
            className={settings.reasoningDepth === 'off' ? 'on' : ''}
            onClick={() => setDepth('off')}
          >
            Off
          </button>
          <button
            className={settings.reasoningDepth === 'medium' ? 'on' : ''}
            onClick={() => setDepth('medium')}
          >
            Medium
          </button>
          <button
            className={settings.reasoningDepth === 'deep' ? 'on' : ''}
            onClick={() => setDepth('deep')}
          >
            Deep
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 14 }}>Reply tone</div>
        <div className="seg">
          <button
            className={settings.replyTone === 'concise' ? 'on' : ''}
            onClick={() => setTone('concise')}
          >
            Concise
          </button>
          <button
            className={settings.replyTone === 'friendly' ? 'on' : ''}
            onClick={() => setTone('friendly')}
          >
            Friendly
          </button>
          <button
            className={settings.replyTone === 'detailed' ? 'on' : ''}
            onClick={() => setTone('detailed')}
          >
            Detailed
          </button>
        </div>
      </div>
    </>
  );
}
