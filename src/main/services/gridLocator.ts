import { desktopCapturer, screen, app } from 'electron';
import { getApiKey } from './key-store';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

export async function locateElement(query: string): Promise<{ x: number; y: number; label: string } | null> {
  const p = screen.getCursorScreenPoint();
  const d = screen.getDisplayNearestPoint(p);
  const b = d.bounds;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: Math.round(1280 * (b.height / b.width)) },
  });

  const source = sources.find((s) => s.display_id === String(d.id)) ?? sources[0];
  if (!source) return null;

  const t = source.thumbnail;
  const z = t.getSize();
  let r = t;
  if (z.width > 1280) {
    r = t.resize({ width: 1280, height: Math.round(z.height * (1280 / z.width)) });
  }

  const jpegBuffer = r.toJPEG(85);
  const base64 = jpegBuffer.toString('base64');

  try {
    const dbg = path.join(app.getPath('userData'), 'debug-gridlocator.jpg');
    fs.writeFileSync(dbg, jpegBuffer);
  } catch {}

  const k = getApiKey('gemini');
  if (!k) return null;

  try {
    const g = new GoogleGenerativeAI(k);
    const m = g.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    const pr = `The user asked: "${query}". Look at this screenshot and find that UI element. Reply ONLY with JSON: {"x": <0-1000>, "y": <0-1000>} where x is the horizontal normalized position (0=left edge, 1000=right edge) and y is the vertical normalized position (0=top, 1000=bottom). Nothing else.`;

    const res = await m.generateContent([
      pr,
      {
        inlineData: {
          data: base64,
          mimeType: 'image/jpeg',
        },
      },
    ]);

    const txt = res.response.text();
    const m2 = txt.match(/\{[\s\S]*?"x"[\s\S]*?"y"[\s\S]*?\}/);
    const parsed = JSON.parse(m2 ? m2[0] : txt);

    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { x: parsed.x, y: parsed.y, label: query };
    }
  } catch {}

  return null;
}
