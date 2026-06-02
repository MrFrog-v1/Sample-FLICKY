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

export class GeminiReasoningAPI {
  async streamChat(
    prompt: string,
    screenshots: ScreenCapture[],
    history: ConversationTurn[],
    modelId: string, // parameter from caller
    options: GeminiChatOptions,
    callbacks: GeminiStreamCallbacks,
  ): Promise<void> {
    const apiKey = getApiKey('gemini');
    if (!apiKey) {
      callbacks.onError(new Error('Gemini API key not configured. Add it in the Flicky panel.'));
      return;
    }

    const systemPrompt = buildSystemPrompt(options.replyTone);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const tools: any[] = [
        { computer_use: {} }
      ];

      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        systemInstruction: systemPrompt,
        tools: tools,
      });

      const contents: Content[] = [];

      for (const turn of history) {
        // Map roles: assistant -> model, user -> user (system is handled in systemInstruction)
        const mappedRole = turn.role === 'assistant' ? 'model' : (turn.role === 'user' ? 'user' : 'user');
        
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

      const resultStream = await model.generateContentStream({
        contents,
      }, {
        signal: options.signal,
      });

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
      const inputTokens = usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;

      callbacks.onComplete(fullText, { inputTokens, outputTokens });
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || options.signal?.aborted)) {
        return;
      }
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
