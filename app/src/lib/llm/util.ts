/**
 * Safely coerce a JSON field (string | array | unknown) to string[].
 */
export function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}
