import {
  GoogleGenerativeAI,
  Content,
  Part
} from '@google/generative-ai';
import type {
  ConversationTurn,
  ScreenCapture,
  ReplyTone,
} from '../../shared/types';
import { getApiKey } from './key-store';
import { buildSystemPrompt } from './prompts';

const COMPLETION_TOKENS = 1024;

export interface GeminiStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string, usage?: { inputTokens: number; outputTokens: number }) => void;
  onError: (error: Error) => void;
}

export interface GeminiChatOptions {
  replyTone: ReplyTone;
  /** Aborting mid-stream is treated as a graceful interrupt, not an error. */
  signal?: AbortSignal;
}

function getGeminiKeys(): string[] {
  return [
    getApiKey('gemini'),
    process.env.GEMINI_FALLBACK_KEY_1,
    process.env.GEMINI_FALLBACK_KEY_2,
    process.env.GEMINI_FALLBACK_KEY_3,
  ].filter(Boolean) as string[];
}

function isRateLimit(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    return msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('quota');
  }
  return false;
}

export class GeminiReasoningAPI {
  async streamChat(
    prompt: string,
    screenshots: ScreenCapture[],
    history: ConversationTurn[],
    modelId: string,
    options: GeminiChatOptions,
    callbacks: GeminiStreamCallbacks,
  ): Promise<void> {
    const keys = getGeminiKeys();
    if (keys.length === 0) {
      callbacks.onError(new Error('Gemini API key not configured. Add it in the Flicky panel.'));
      return;
    }

    const systemPrompt = buildSystemPrompt(options.replyTone);

    const contents: Content[] = [];
    for (const turn of history) {
      const mappedRole = turn.role === 'assistant' ? 'model' : 'user';
      contents.push({ role: mappedRole, parts: [{ text: turn.content }] });
    }

    const userParts: Part[] = [];
    for (let i = 0; i < screenshots.length; i++) {
      const sc = screenshots[i];
      userParts.push({
        text: `[screen${i}] screenshot of the user's display.${sc.isCursorScreen ? ' (active screen — cursor is here)' : ''}`,
      });
      userParts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: sc.dataBase64,
        },
      });
    }
    userParts.push({ text: prompt });
    contents.push({ role: 'user', parts: userParts });

    let lastErr: Error | null = null;

    for (let i = 0; i < keys.length; i++) {
      if (options.signal?.aborted) return;
      try {
        console.log(`[GeminiAPI] Trying key ${i + 1}/${keys.length}`);
        const genAI = new GoogleGenerativeAI(keys[i]);
        const tools: any[] = [{ computer_use: {} }];
        const model = genAI.getGenerativeModel({
          model: 'gemini-3-flash-preview',
          systemInstruction: systemPrompt,
          tools,
        });

        const resultStream = await model.generateContentStream({ contents }, { signal: options.signal });

        let fullText = '';
        for await (const chunk of resultStream.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            fullText += chunkText;
            callbacks.onChunk(chunkText);
          }
        }

        const response = await resultStream.response;
        const usageMetadata = response.usageMetadata;
        callbacks.onComplete(fullText, {
          inputTokens: usageMetadata?.promptTokenCount ?? 0,
          outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
        });
        return;
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || options.signal?.aborted)) return;
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (isRateLimit(err) && i < keys.length - 1) {
          console.warn(`[GeminiAPI] Key ${i + 1} rate-limited, trying next key...`);
          continue;
        }
        break;
      }
    }

    callbacks.onError(lastErr ?? new Error('All Gemini keys exhausted'));
  }
}
