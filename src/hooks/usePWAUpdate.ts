import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useState } from 'react';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);

  const {
    needRefresh: [pwaNeedRefresh, setPWANeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    if (pwaNeedRefresh) {
      setNeedRefresh(true);
    }
  }, [pwaNeedRefresh]);

  const triggerUpdate = () => {
    updateServiceWorker(true);
  };

  const closeUpdate = () => {
    setNeedRefresh(false);
    setPWANeedRefresh(false);
  };

  return {
    needRefresh,
    triggerUpdate,
    closeUpdate,
  };
}
