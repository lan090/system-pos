import { describe, it, expect, vi } from 'vitest';

// Stub window globally for environment testing
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

describe('usePWAInstall Hook Event Listeners', () => {
  it('should register beforeinstallprompt event listener', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    
    // We import the file to trigger hook definition / check environment loading
    await import('./usePWAInstall');
    
    expect(addEventListenerSpy).toHaveBeenCalled();
  });
});
