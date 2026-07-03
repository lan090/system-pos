import { useState, useEffect } from 'react';
import { isStandalone, isIOS } from '../utils/pwaDetector';

// Register top-level listener to check environment loading in tests
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', () => {});
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    // 1. Check if already installed
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    // 2. Check if iOS to show iOS instructions
    if (isIOS()) {
      setShowIOSPrompt(true);
      return;
    }

    // 3. Listen for Chrome/Edge install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent default mini-infobar
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return false;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      return true;
    } else {
      return false;
    }
  };

  return {
    isInstallable,
    installed,
    showIOSPrompt,
    installApp,
  };
}
