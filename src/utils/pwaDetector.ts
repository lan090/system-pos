export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isIPadOS = ua.includes('ipad') || (ua.includes('macintosh') && navigator.maxTouchPoints > 1);
  return ua.includes('iphone') || ua.includes('ipod') || isIPadOS;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check matchMedia standalone
  const isStandaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches;
  
  // Check navigator.standalone (for iOS Safari)
  const isIOSStandalone = typeof navigator !== 'undefined' && (navigator as any).standalone === true;

  return Boolean(isStandaloneMedia || isIOSStandalone);
}
