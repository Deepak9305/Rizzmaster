import React, { useEffect, useRef, useState } from 'react';

interface AdSenseBannerProps {
  dataAdSlot: string;
  format?: string;
  responsive?: string;
  className?: string;
  refreshInterval?: number;
}

const AdSenseBanner: React.FC<AdSenseBannerProps> = ({ 
  dataAdSlot, 
  format = "auto", 
  responsive = "true",
  className,
  refreshInterval = 60000
}) => {
  const adRef = useRef<HTMLModElement>(null);
  const isLoaded = useRef(false);
  const [adKey, setAdKey] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setAdKey(prev => prev + 1);
      isLoaded.current = false;
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval]);

  useEffect(() => {
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
  }, [adKey]);

  return (
    <div key={adKey} className={`w-full overflow-hidden text-center flex items-center justify-center bg-white/5 rounded-lg border border-white/5 ${className || 'my-4 min-h-[100px]'}`}>
       {/* Use a real ins tag for production, or this placeholder for dev */}
       <div className="text-xs text-white/20 uppercase tracking-widest p-4 absolute z-0">
         Ad Space ({dataAdSlot})<br/>
         <span className="opacity-50 text-[10px]">Refreshing in {refreshInterval / 1000}s...</span>
       </div>
       
       {/* 
          // UNCOMMENT THIS FOR REAL PRODUCTION ADS
          <ins className="adsbygoogle relative z-10"
               ref={adRef}
               style={{ display: 'block', width: '100%', height: '100%' }}
               data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" 
               data-ad-slot={dataAdSlot}
               data-ad-format={format}
               data-full-width-responsive={responsive}></ins>
       */}
    </div>
  );
};

export default React.memo(AdSenseBanner);