import { desktopCapturer, screen, app } from 'electron';
import { getApiKey } from './key-store';
import * as settingsStore from './settings-store';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Percentage-based element locator.
 *
 * Captures a screenshot, sends it to a dedicated vision model (separate from
 * the user's active chat model), and asks for percentage-based coordinates.
 * Tries providers in order: Groq → OpenRouter → Ollama.
 *
 * Returns real screen pixel coordinates or null if all providers fail.
 */

// ── Provider configuration ─────────────────────────────────────────────

interface ProviderConfig {
  name: string;
  url: string;
  model: string;
  getApiKey: () => string | null;
  /** Whether this provider supports response_format: json_object */
  supportsJsonFormat: boolean;
  /** For Ollama — uses a different request format */
  isOllama: boolean;
}

function getProviderCascade(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  // 1. Groq — llama-4-scout (vision-capable)
  providers.push({
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    getApiKey: () => getApiKey('groq'),
    supportsJsonFormat: true,
    isOllama: false,
  });

  // 2. OpenRouter — qwen/qwen2.5-vl-7b-instruct:free
  providers.push({
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'qwen/qwen2.5-vl-7b-instruct:free',
    getApiKey: () => getApiKey('openrouter'),
    supportsJsonFormat: true,
    isOllama: false,
  });

  // 3. Ollama — qwen2.5vl:7b (local, no API key needed)
  // Find the first local connection that is enabled
  const connections = settingsStore.get('localConnections') ?? [];
  const ollamaConn = connections.find((c) => c.enabled);
  const ollamaUrl = ollamaConn?.url ?? 'http://localhost:11434';

  providers.push({
    name: 'Ollama',
    url: `${ollamaUrl.replace(/\/+$/, '')}/api/chat`,
    model: 'qwen2.5vl:7b',
    getApiKey: () => 'ollama-local', // Always "available" — may fail at call time
    supportsJsonFormat: false,
    isOllama: true,
  });

  return providers;
}

// ── Vision model call ──────────────────────────────────────────────────

const LOCATE_PROMPT_TEMPLATE = (query: string) =>
  `The user asked: "${query}". Look at this screenshot and find that UI element. Reply ONLY with JSON: {"x": <0-100>, "y": <0-100>} where x is the horizontal percentage position (0=left edge, 100=right edge) and y is the vertical percentage position (0=top, 100=bottom). Nothing else.`;

async function askVisionProvider(
  base64Image: string,
  prompt: string,
  provider: ProviderConfig,
): Promise<string | null> {
  const apiKey = provider.getApiKey();
  if (!apiKey) return null;

  try {
    if (provider.isOllama) {
      return await callOllama(base64Image, prompt, provider);
    }
    return await callOpenAICompatible(base64Image, prompt, provider, apiKey);
  } catch (err) {
    console.error(`[GridLocator] ${provider.name} call failed:`, err);
    return null;
  }
}

async function callOpenAICompatible(
  base64Image: string,
  prompt: string,
  provider: ProviderConfig,
  apiKey: string,
): Promise<string | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  // OpenRouter requires extra headers
  if (provider.name === 'OpenRouter') {
    headers['HTTP-Referer'] = 'https://github.com/sidecar-ai/flicky';
    headers['X-Title'] = 'Flicky';
  }

  const body: Record<string, unknown> = {
    model: provider.model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
    max_tokens: 100,
    temperature: 0,
  };

  // Use json_object response format for providers that support it
  if (provider.supportsJsonFormat) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(provider.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    console.error(`[GridLocator] ${provider.name} HTTP ${response.status}: ${errText}`);
    return null;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : null;
}

async function callOllama(
  base64Image: string,
  prompt: string,
  provider: ProviderConfig,
): Promise<string | null> {
  const body = {
    model: provider.model,
    messages: [
      {
        role: 'user',
        content: 'Respond with valid JSON only. ' + prompt,
        images: [base64Image],
      },
    ],
    stream: false,
  };

  const response = await fetch(provider.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000), // Ollama can be slower
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown');
    console.error(`[GridLocator] Ollama HTTP ${response.status}: ${errText}`);
    return null;
  }

  const data = await response.json();
  return typeof data.message?.content === 'string' ? data.message.content : null;
}

// ── JSON extraction ────────────────────────────────────────────────────

interface LocateResult {
  x: number;
  y: number;
}

/**
 * Extract {x, y} from a model response using a 3-tier fallback:
 *  1. Direct JSON.parse of the entire response
 *  2. Regex to find a JSON object with x/y keys anywhere in text
 *  3. Last resort: just find two numbers (first = x, second = y)
 */
function extractCoordinates(raw: string): LocateResult | null {
  // Tier 1: direct JSON.parse
  try {
    const parsed = JSON.parse(raw.trim());
    if (isValidCoordinate(parsed)) return { x: parsed.x, y: parsed.y };
  } catch {
    // Fall through
  }

  // Tier 2: regex to find {"x": ..., "y": ...} embedded in text/markdown
  const jsonMatch = raw.match(/\{[\s\S]*?"x"[\s\S]*?"y"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isValidCoordinate(parsed)) return { x: parsed.x, y: parsed.y };
    } catch {
      // Fall through
    }
  }

  // Tier 3: just find two numbers — assume first is x, second is y
  const nums = raw.match(/(\d+)/g);
  if (nums && nums.length >= 2) {
    const x = parseInt(nums[0], 10);
    const y = parseInt(nums[1], 10);
    if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
      return { x, y };
    }
  }

  return null;
}

function isValidCoordinate(obj: unknown): obj is { x: number; y: number } {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    o.x >= 0 && o.x <= 100 &&
    o.y >= 0 && o.y <= 100
  );
}

// ── Screenshot capture ─────────────────────────────────────────────────

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 85;

async function captureScreenshot(): Promise<{
  base64: string;
  w: number;
  h: number;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
} | null> {
  try {
    const p = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(p);
    const b = d.bounds;
    const f = d.scaleFactor || 1;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: MAX_WIDTH, height: Math.round(MAX_WIDTH * (b.height / b.width)) },
    });

    const source = sources.find((s) => s.display_id === String(d.id)) ?? sources[0];
    if (!source) return null;

    const t = source.thumbnail;
    const z = t.getSize();

    let r = t;
    if (z.width > MAX_WIDTH) {
      const s = MAX_WIDTH / z.width;
      r = t.resize({
        width: MAX_WIDTH,
        height: Math.round(z.height * s),
      });
    }

    const a = r.getSize();
    const jpegBuffer = r.toJPEG(JPEG_QUALITY);
    const base64 = jpegBuffer.toString('base64');

    try {
      const dbg = path.join(app.getPath('userData'), 'debug-gridlocator.jpg');
      fs.writeFileSync(dbg, jpegBuffer);
      console.log(`[GridLocator] capture: display=${b.width}x${b.height}, scale=${f}, thumbDIP=${z.width}x${z.height}, resizedDIP=${a.width}x${a.height}, jpegBytes=${jpegBuffer.length}, saved=${dbg}`);
    } catch {
      console.log(`[GridLocator] capture: display=${b.width}x${b.height}, scale=${f}, thumbDIP=${z.width}x${z.height}, resizedDIP=${a.width}x${a.height}, jpegBytes=${jpegBuffer.length}`);
    }

    return { base64, w: a.width, h: a.height, bounds: b, scaleFactor: f };
  } catch (err) {
    console.error('[GridLocator] Screenshot capture failed:', err);
    return null;
  }
}

// ── Main locator function ──────────────────────────────────────────────

const MAX_RETRIES = 2;

export async function locateElement(
  query: string,
): Promise<{ x: number; y: number; label: string } | null> {
  console.log(`[GridLocator] Locating element: "${query}"`);

  // Step 1: Capture screenshot
  const screenshot = await captureScreenshot();
  if (!screenshot) {
    console.error('[GridLocator] Failed to capture screenshot');
    return null;
  }

  const { base64, w: iw, h: ih, bounds: sb, scaleFactor: sf } = screenshot;
  const prompt = LOCATE_PROMPT_TEMPLATE(query);
  const providers = getProviderCascade();

  for (const provider of providers) {
    const apiKey = provider.getApiKey();
    if (!apiKey) {
      console.log(`[GridLocator] Skipping ${provider.name} — no API key`);
      continue;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(`[GridLocator] Trying ${provider.name} (attempt ${attempt}/${MAX_RETRIES})`);

      const rawResponse = await askVisionProvider(base64, prompt, provider);
      if (!rawResponse) {
        console.log(`[GridLocator] ${provider.name} returned no response`);
        continue;
      }

      console.log(`[GridLocator] ${provider.name} raw response:`, rawResponse);

      const coords = extractCoordinates(rawResponse);
      if (!coords) {
        console.log(`[GridLocator] ${provider.name} returned invalid JSON, retrying...`);
        continue;
      }

      console.log(
        `[GridLocator] Success via ${provider.name}: pct=(${coords.x}, ${coords.y})`,
      );

      return { x: coords.x, y: coords.y, label: query };
    }

    console.log(`[GridLocator] ${provider.name} exhausted retries`);
  }

  console.error('[GridLocator] All providers failed to locate element');
  return null;
}
