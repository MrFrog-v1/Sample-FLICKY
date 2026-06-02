import type { ConversationTurn, MemoryStats } from '../../shared/types';
import { getApiKey } from './key-store';
import * as settingsStore from './settings-store';

/**
 * Token-based conversation memory.
 *
 * - Tracks an approximate running token count for the full conversation.
 * - Keeps the most recent KEEP_RECENT messages verbatim.
 * - When total tokens cross COMPACT_TRIGGER, summarizes everything older
 *   than the recent window into a single rolling summary prepended to
 *   the history, and drops the compacted messages.
 *
 * Token count is approximate — we use a 4 chars/token heuristic for
 * anything that wasn't metered by the API.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export const MAX_TOKEN_BUDGET = 250_000;
export const COMPACT_TRIGGER = 200_000;
export const KEEP_RECENT = 10;

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface TrackedTurn extends ConversationTurn {
  tokens: number;
}

export class ContextManager {
  private turns: TrackedTurn[] = [];
  private summary: string | null = null;
  private summaryTokens = 0;
  private lastCompactedAt: number | null = null;
  private summarizedCount = 0;

  /** Returns a copy of the messages we should send to the LLM this turn. */
  getMessagesForSend(): ConversationTurn[] {
    const out: ConversationTurn[] = [];
    if (this.summary) {
      out.push({
        role: 'user',
        content: `[summary of earlier conversation]\n${this.summary}`,
      });
      out.push({
        role: 'assistant',
        content: 'got it, picking up from there.',
      });
    }
    for (const t of this.turns) out.push({ role: t.role, content: t.content });
    return out;
  }

  /**
   * Append a user/assistant exchange. Called once per turn after we have
   * the final assistant text.
   */
  async recordExchange(
    userText: string,
    assistantText: string,
    opts: { inputTokens?: number; outputTokens?: number } = {},
  ): Promise<void> {
    const userTok = opts.inputTokens ?? approxTokens(userText);
    const asstTok = opts.outputTokens ?? approxTokens(assistantText);

    this.turns.push({ role: 'user', content: userText, tokens: userTok });
    this.turns.push({ role: 'assistant', content: assistantText, tokens: asstTok });

    if (this.totalTokens() >= COMPACT_TRIGGER) {
      await this.compact();
    }
  }

  /** Is there anything we could fold into a summary right now? */
  canCompact(): boolean {
    return this.turns.length >= 3;
  }

  totalTokens(): number {
    let sum = this.summaryTokens;
    for (const t of this.turns) sum += t.tokens;
    return sum;
  }

  /**
   * Summarize everything older than the KEEP_RECENT window into a single
   * rolling summary. If we already have a summary, fold it in.
   */
  async compact(force = false): Promise<void> {
    const keep = force ? Math.min(2, this.turns.length) : KEEP_RECENT;
    if (this.turns.length <= keep) return;

    const olderTurns = this.turns.slice(0, this.turns.length - keep);
    const recentTurns = this.turns.slice(this.turns.length - keep);

    const transcript = olderTurns
      .map((t) => `${t.role === 'user' ? 'User' : 'Flicky'}: ${t.content}`)
      .join('\n\n');

    const priorSummaryBlock = this.summary
      ? `Prior summary of earlier conversation:\n${this.summary}\n\nNew exchanges to fold in:\n`
      : '';

    const prompt =
      priorSummaryBlock +
      transcript +
      '\n\nWrite a concise running summary of this conversation so far. Preserve names, decisions, preferences, tasks in progress, and unresolved questions. Drop chit-chat. Use 2–6 short paragraphs, no bullet points.';

    try {
      let summary = '';
      const provider = settingsStore.get('mindProvider');
      if (provider === 'gemini') {
        summary = await this.summarizeViaGemini(prompt);
      } else if (provider === 'openrouter') {
        summary = await this.summarizeViaOpenRouter(prompt);
      } else {
        summary = await this.summarizeViaGroq(prompt);
      }
      this.summary = summary;
      this.summaryTokens = approxTokens(this.summary);
      this.summarizedCount += olderTurns.length;
      this.turns = recentTurns;
      this.lastCompactedAt = Date.now();
    } catch (err) {
      console.error('[Flicky] context compact failed:', err);
      if (force) {
        throw err;
      }
      // Auto-compact fallback: drop the oldest half of non-recent turns
      const dropCount = Math.ceil(olderTurns.length / 2);
      this.turns = [...olderTurns.slice(dropCount), ...recentTurns];
      this.summarizedCount += dropCount;
      this.lastCompactedAt = Date.now();
    }
  }

  /** Summarize via Groq's OpenAI-compatible API. */
  private async summarizeViaGroq(prompt: string): Promise<string> {
    const apiKey = getApiKey('groq');
    if (!apiKey) {
      throw new Error('Groq API key not configured — add it in the Mind tab.');
    }

    const model = 'meta-llama/llama-4-scout-17b-16e-instruct';
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 1024,
      }),
    });
    if (!response.ok) {
      throw new Error(`compact (groq) ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw new Error('no summary text');
    return text;
  }

  /** Summarize via OpenRouter. */
  private async summarizeViaOpenRouter(prompt: string): Promise<string> {
    const apiKey = getApiKey('openrouter');
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured — add it in the Mind tab.');
    }

    const model = 'meta-llama/llama-3.3-70b-instruct:free';
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/sidecar-ai/flicky',
        'X-Title': 'Flicky',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 1024,
      }),
    });
    if (!response.ok) {
      throw new Error(`compact (openrouter) ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw new Error('no summary text');
    return text;
  }

  /** Summarize via Google Gemini. */
  private async summarizeViaGemini(prompt: string): Promise<string> {
    const apiKey = getApiKey('gemini');
    if (!apiKey) {
      throw new Error('Gemini API key not configured \u2014 add it in the Mind tab.');
    }

    const model = 'gemini-3.5-flash';
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 1024,
      }),
    });
    if (!response.ok) {
      throw new Error(`compact (gemini) ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw new Error('no summary text');
    return text;
  }

  clear(): void {
    this.turns = [];
    this.summary = null;
    this.summaryTokens = 0;
    this.summarizedCount = 0;
    this.lastCompactedAt = null;
  }

  getStats(): MemoryStats {
    return {
      tokens: this.totalTokens(),
      tokenBudget: MAX_TOKEN_BUDGET,
      messageCount: this.turns.length,
      summarizedCount: this.summarizedCount,
      hasSummary: this.summary !== null,
      lastCompactedAt: this.lastCompactedAt,
    };
  }
}
