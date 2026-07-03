import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isStandalone, isIOS } from './pwaDetector';

describe('PWA Detector Utilities', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      userAgent: '',
      standalone: false,
      maxTouchPoints: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should detect iOS based on User Agent', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(true);

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(false);
  });

  it('should detect iPadOS 13+ based on Macintosh user agent with touch points', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(false);
  });

  it('should detect standalone mode when display-mode matches', () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    vi.stubGlobal('window', {
      matchMedia: matchMediaMock,
    });

    expect(isStandalone()).toBe(true);
  });

  it('should detect standalone mode on iOS navigator.standalone', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'iPhone',
      standalone: true,
    });
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    expect(isStandalone()).toBe(true);
  });
});
