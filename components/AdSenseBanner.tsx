import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSenseBannerProps {
  dataAdSlot: string;
  format?: string;
  responsive?: string;
  className?: string;
  refreshInterval?: number;
  devMode?: boolean; // Added DEV_MODE optimization
  width?: number;
  height?: number;
}

const ADSENSE_SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7381421031784616';

let adsenseScriptPromise: Promise<void> | null = null;

const ensureAdSenseScript = (): Promise<void> => {
  if (typeof document === 'undefined') return Promise.resolve();
  if (window.adsbygoogle) return Promise.resolve();
  if (adsenseScriptPromise) return adsenseScriptPromise;

  adsenseScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${ADSENSE_SCRIPT_SRC}"]`);
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true' || window.adsbygoogle) {
        resolve();
        return;
      }

      existingScript.addEventListener('load', () => {
        existingScript.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      existingScript.addEventListener('error', () => {
        adsenseScriptPromise = null;
        reject(new Error('Failed to load AdSense script.'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = ADSENSE_SCRIPT_SRC;
    script.dataset.loaded = 'false';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      adsenseScriptPromise = null;
      reject(new Error('Failed to load AdSense script.'));
    }, { once: true });
    document.head.appendChild(script);
  });

  return adsenseScriptPromise;
};

const AdSenseBanner: React.FC<AdSenseBannerProps> = ({
  dataAdSlot,
  format,
  responsive = "false",
  className,
  refreshInterval = 0,
  devMode = false, // Set to true locally to show placeholder without loading real ads
  width = 320,
  height = 50
}) => {
  const adRef = useRef<HTMLModElement>(null);
  const isLoaded = useRef(false);
  const [adKey, setAdKey] = useState(0);
  const [scriptReady, setScriptReady] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState === 'visible'
  ));

  useEffect(() => {
    if (devMode || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [devMode]);

  useEffect(() => {
    if (devMode || typeof document === 'undefined') return;

    let cancelled = false;
    void ensureAdSenseScript()
      .then(() => {
        if (!cancelled) setScriptReady(true);
      })
      .catch((err) => {
        console.error('AdSense Script Error:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [devMode]);

  useEffect(() => {
    // Keep auto-refresh opt-in. Repeated sticky-banner refreshes can create
    // ad requests while the user is not actively viewing the page.
    if (devMode || !refreshInterval || !pageVisible) return;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      setAdKey(prev => prev + 1);
      isLoaded.current = false;
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval, devMode, pageVisible]);

  useEffect(() => {
    if (devMode) return; // Do not try to push ads in dev mode
    if (!pageVisible) return;
    if (!scriptReady) return;

    // Only push the ad once per mount to avoid multiple pushes to the same slot
    if (adRef.current && !isLoaded.current) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        isLoaded.current = true;
      } catch (err) {
        console.error("AdSense Error:", err);
      }
    }
  }, [adKey, devMode, pageVisible, scriptReady]);

  if (devMode) {
    return (
      <div
        className={`w-full overflow-hidden text-center flex items-center justify-center bg-white/5 rounded-lg border border-dashed border-white/20 ${className || 'my-2'}`}
        style={{ height }}
      >
        <div className="text-xs text-white/40 uppercase tracking-widest p-4">
          Ad Space ({dataAdSlot})<br />
          <span className="opacity-50 text-[10px]">(DEV_MODE Active)</span>
        </div>
      </div>
    );
  }

  const adStyle: React.CSSProperties = responsive === "true"
    ? { display: 'block', width: '100%', height: '100%' }
    : { display: 'inline-block', width, height, maxWidth: '100%' };

  return (
    <div
      key={adKey}
      className={`w-full overflow-hidden text-center flex items-center justify-center bg-transparent ${className || 'my-2'}`}
      style={{ height }}
    >
      <ins className="adsbygoogle relative z-10"
        ref={adRef}
        style={adStyle}
        data-ad-client="ca-pub-7381421031784616"
        data-ad-slot={dataAdSlot}
        data-ad-format={format}
        data-full-width-responsive={responsive}></ins>
    </div>
  );
};


export default AdSenseBanner;
