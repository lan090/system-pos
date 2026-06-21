// src/utils/telemetry/__tests__/PIISanitizer.test.ts
import { describe, it, expect } from 'vitest';
import type { TelemetryQueueItem, ProviderStatus } from '../types';
import { sanitize, enforcePayloadSizeLimit } from '../PIISanitizer';

describe('Types: TelemetryQueueItem', () => {
  it('should have correct shape for a queue item', () => {
    const item: TelemetryQueueItem = {
      event_id: 'test-uuid',
      event_name: 'test_event',
      payload: { key: 'value' },
      provider_states: { ConsoleTelemetryProvider: 'pending' },
      retry_count: 0,
      created_at: new Date().toISOString(),
      priority: 'normal',
      payload_size_bytes: 42,
    };
    const status: ProviderStatus = 'pending';
    expect(item.event_id).toBe('test-uuid');
    expect(status).toBe('pending');
  });
});

describe('PIISanitizer.sanitize()', () => {
  it('masks top-level PII keys', () => {
    const result = sanitize({
      username: 'alice',
      password: 'hunter2',
      event: 'login',
    });
    expect(result['password']).toBe('[REDACTED]');
    expect(result['username']).toBe('alice');
    expect(result['event']).toBe('login');
  });

  it('masks PII keys case-insensitively', () => {
    const result = sanitize({ PASSWORD: 'secret', Token: 'abc123' });
    expect(result['PASSWORD']).toBe('[REDACTED]');
    expect(result['Token']).toBe('[REDACTED]');
  });

  it('recursively masks nested PII keys', () => {
    const result = sanitize({
      user: {
        email: 'test@example.com',
        address: {
          ssn: '123-45-6789',
          city: 'Jakarta',
        },
      },
    });
    expect((result['user'] as any)['email']).toBe('[REDACTED]');
    expect((result['user'] as any)['address']['ssn']).toBe('[REDACTED]');
    expect((result['user'] as any)['address']['city']).toBe('Jakarta');
  });

  it('masks all required PII key names: password, token, secret, authorization, credit_card, email, phone, ssn', () => {
    const input: Record<string, string> = {
      password: 'x', token: 'x', secret: 'x', authorization: 'x',
      credit_card: 'x', email: 'x', phone: 'x', ssn: 'x',
    };
    const result = sanitize(input);
    for (const key of Object.keys(input)) {
      expect(result[key]).toBe('[REDACTED]');
    }
  });

  it('does not mutate the original object', () => {
    const original = { password: 'secret', name: 'alice' };
    sanitize(original);
    expect(original.password).toBe('secret');
  });

  it('handles arrays within the payload by sanitizing each element', () => {
    const result = sanitize({
      users: [
        { email: 'a@b.com', age: 30 },
        { email: 'c@d.com', age: 25 },
      ],
    });
    const users = result['users'] as any[];
    expect(users[0]['email']).toBe('[REDACTED]');
    expect(users[0]['age']).toBe(30);
    expect(users[1]['email']).toBe('[REDACTED]');
  });

  it('passes through non-object primitives untouched', () => {
    const result = sanitize({ count: 42, active: true, label: 'test' });
    expect(result['count']).toBe(42);
    expect(result['active']).toBe(true);
    expect(result['label']).toBe('test');
  });
});

describe('PIISanitizer.enforcePayloadSizeLimit()', () => {
  it('returns payload unchanged when under 10KB', () => {
    const small = { data: 'hello world' };
    const result = enforcePayloadSizeLimit(small);
    expect(result).toEqual(small);
  });

  it('truncates payload and injects _truncated flag when over 10KB', () => {
    // Build a payload larger than 10240 bytes
    const largeValue = 'x'.repeat(11000);
    const big = { data: largeValue };
    const result = enforcePayloadSizeLimit(big);
    expect(result['_truncated']).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized.length).toBeLessThanOrEqual(10240 + 100); // small overhead for _truncated key
  });

  it('does not add _truncated flag when payload is exactly at limit', () => {
    const borderlineData = 'x'.repeat(10200);
    // JSON.stringify wraps in {"data":"..."} adding ~9 chars overhead
    const result = enforcePayloadSizeLimit({ data: borderlineData });
    // 10200 + 9 overhead = 10209, under 10240 → no truncation
    expect(result['_truncated']).toBeUndefined();
  });
});
