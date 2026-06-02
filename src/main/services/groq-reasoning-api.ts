import type {
  ConversationTurn,
  ScreenCapture,
  ReplyTone,
} from '../../shared/types';
import { getApiKey } from './key-store';
import { buildSystemPrompt } from './prompts';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const COMPLETION_TOKENS = 1024;

export interface GroqStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string, usage?: { inputTokens: number; outputTokens: number }) => void;
  onError: (error: Error) => void;
}

export interface GroqChatOptions {
  replyTone: ReplyTone;
  /** Aborting mid-stream is treated as a graceful interrupt, not an error. */
  signal?: AbortSignal;
}

export class GroqReasoningAPI {
  async streamChat(
    prompt: string,
    screenshots: ScreenCapture[],
    history: ConversationTurn[],
    model: string,
    options: GroqChatOptions,
    callbacks: GroqStreamCallbacks,
  ): Promise<void> {
    const apiKey = getApiKey('groq');
    if (!apiKey) {
      callbacks.onError(new Error('Groq API key not configured. Add it in the Flicky panel.'));
      return;
    }

    const systemPrompt = buildSystemPrompt(options.replyTone);

    const messages: Array<{ role: string; content: unknown }> = [
      { role: 'system', content: systemPrompt },
    ];

    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content });
    }

    const userContent: Array<Record<string, unknown>> = [];
    for (let i = 0; i < screenshots.length; i++) {
      const sc = screenshots[i];
      userContent.push({
        type: 'text',
        text: `[screen${i}] screenshot of the user's display.${sc.isCursorScreen ? ' (active screen — cursor is here)' : ''}`,
      });
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${sc.dataBase64}` },
      });
    }
    userContent.push({ type: 'text', text: prompt });

    messages.push({ role: 'user', content: userContent });

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      max_completion_tokens: COMPLETION_TOKENS,
    };

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const event = JSON.parse(data);
            const chunk = event.choices?.[0]?.delta?.content;
            if (typeof chunk === 'string' && chunk.length > 0) {
              fullText += chunk;
              callbacks.onChunk(chunk);
            }
            if (event.usage) {
              inputTokens = event.usage.prompt_tokens ?? 0;
              outputTokens = event.usage.completion_tokens ?? 0;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      callbacks.onComplete(fullText, { inputTokens, outputTokens });
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || options.signal?.aborted)) {
        return;
      }
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
