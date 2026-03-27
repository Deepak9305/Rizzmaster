import React, { useEffect, useRef, useState } from 'react';

interface AdSenseBannerProps {
  dataAdSlot: string;
  format?: string;
  responsive?: string;
  className?: string;
  refreshInterval?: number;
  devMode?: boolean; // Added DEV_MODE optimization
}

const AdSenseBanner: React.FC<AdSenseBannerProps> = ({
  dataAdSlot,
  format = "auto",
  responsive = "true",
  className,
  refreshInterval = 60000,
  devMode = true // Default to true so placeholders don't waste cycles
}) => {
  const adRef = useRef<HTMLModElement>(null);
  const isLoaded = useRef(false);
  const [adKey, setAdKey] = useState(0);

  useEffect(() => {
    // Only set up the refresh interval if we are NOT in dev mode
    if (devMode) return;

    const timer = setInterval(() => {
      setAdKey(prev => prev + 1);
      isLoaded.current = false;
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval, devMode]);

  useEffect(() => {
    if (devMode) return; // Do not try to push ads in dev mode

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
  }, [adKey, devMode]);

  if (devMode) {
    return (
      <div className={`w-full overflow-hidden text-center flex items-center justify-center bg-white/5 rounded-lg border border-dashed border-white/20 ${className || 'my-4 min-h-[100px]'}`}>
        <div className="text-xs text-white/40 uppercase tracking-widest p-4">
          Ad Space ({dataAdSlot})<br />
          <span className="opacity-50 text-[10px]">(DEV_MODE Active)</span>
        </div>
      </div>
    );
  }

  return (
    <div key={adKey} className={`w-full overflow-hidden text-center flex items-center justify-center bg-transparent ${className || 'my-4 min-h-[100px]'}`}>
      <ins className="adsbygoogle relative z-10"
        ref={adRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        data-ad-client="ca-pub-7381421031784616"
        data-ad-slot={dataAdSlot}
        data-ad-format={format}
        data-full-width-responsive={responsive}></ins>
    </div>
  );
};


export default AdSenseBanner;