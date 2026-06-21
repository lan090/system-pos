// =========================================================================
// src/utils/telemetry/PIISanitizer.ts
// FSRMS v2.0 — PII Masking Middleware
// =========================================================================

const MAX_PAYLOAD_BYTES = 10240; // 10 KB

/**
 * Lowercase set of PII-sensitive key names.
 * Keys are matched case-insensitively against object properties.
 */
const PII_KEYS = new Set([
  'password', 'token', 'secret', 'authorization',
  'credit_card', 'email', 'phone', 'ssn',
]);

const REDACTED = '[REDACTED]';

/**
 * Recursively deep-clones `obj` while masking any key whose lowercase name
 * appears in PII_KEYS. Arrays are handled element-by-element.
 *
 * Does NOT mutate the input object.
 */
export function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(obj) as Record<string, unknown>;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = PII_KEYS.has(key.toLowerCase()) ? REDACTED : sanitizeValue(val);
    }
    return result;
  }
  // Primitive — return as-is
  return value;
}

/**
 * Enforces a 10 KB size cap on the serialized payload.
 * If the payload exceeds the limit, the value of the largest key is truncated
 * and a `_truncated: true` flag is injected.
 *
 * Returns a new object; never mutates the input.
 */
export function enforcePayloadSizeLimit(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const serialized = JSON.stringify(payload);
  if (serialized.length <= MAX_PAYLOAD_BYTES) {
    return payload;
  }

  // Return a minimal marker payload so the event is not silently dropped
  return {
    _truncated: true,
    _original_size_bytes: serialized.length,
    _event_name: (payload['event_name'] as string | undefined) ?? 'unknown',
  };
}

/**
 * Calculates byte size of the serialized payload for storage tracking.
 */
export function measurePayloadBytes(payload: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}
