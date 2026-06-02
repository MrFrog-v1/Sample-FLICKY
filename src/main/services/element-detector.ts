/**
 * Parse [LOCATE:label] tags from AI responses.
 *
 * The AI emits a lightweight [LOCATE:label] tag when it wants to point
 * at a screen element. The actual coordinate computation is handled by
 * the dedicated grid locator (gridLocator.ts).
 */

const LOCATE_TAG_REGEX = /\[LOCATE:\s*([^\]]+)\]/;

/**
 * Extract the label from a [LOCATE:label] tag in the AI response.
 * Returns the label string (e.g. "search bar") or null if no tag found.
 */
export function parseLocateTag(responseText: string): string | null {
  const match = LOCATE_TAG_REGEX.exec(responseText);
  if (!match) return null;
  return match[1].trim();
}

