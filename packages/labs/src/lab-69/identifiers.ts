/** Orders the assistant knows (sandbox). */
export const ORDERS: Record<string, { item: string; status: string; eta: string }> = {
  'ORD-5001': { item: 'Ceramic mug', status: 'shipped', eta: 'Thursday' },
  'ORD-5002': { item: 'Espresso machine', status: 'packing', eta: 'next Monday' },
};

export interface HeardId {
  heard: string;
  normalized: string;
  /** True only when the id was heard exactly (ORD-1234); anything reconstructed must be confirmed. */
  confirmed: boolean;
}

/**
 * Order ids from text. Speech recognition mishears them ("Ority 5001", "order 5001", "O R D 5001"), so
 * those forms are normalized to ORD-5001 but marked unconfirmed: the assistant asks before acting on them.
 */
export function confirmIdentifiers(text: string): HeardId[] {
  const found: HeardId[] = [];
  const add = (heard: string, digits: string, confirmed: boolean) => {
    const normalized = `ORD-${digits}`;
    if (!found.some((f) => f.normalized === normalized)) found.push({ heard: heard.trim(), normalized, confirmed });
  };
  for (const m of text.matchAll(/\bORD-(\d{4})\b/g)) add(m[0], m[1]!, true);
  for (const m of text.matchAll(/\b(?:ORD\s+|ority|orty|order(?:\s+number)?|o\.?\s*r\.?\s*d\.?)\s*[-#:]?\s*(\d{4})\b/gi))
    add(m[0], m[1]!, false);
  return found.slice(0, 10);
}
