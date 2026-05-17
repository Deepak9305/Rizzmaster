import React, { useEffect, useRef, useState } from 'react';

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

    // Only push the ad once per mount to avoid multiple pushes to the same slot
    if (adRef.current && !isLoaded.current) {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        isLoaded.current = true;
      } catch (err) {
        console.error("AdSense Error:", err);
      }
    }
  }, [adKey, devMode, pageVisible]);

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
