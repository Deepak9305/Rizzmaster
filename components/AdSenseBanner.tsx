import React, { useEffect, useState } from 'react';

interface AdSenseBannerProps {
  dataAdSlot: string;
  format?: string;
  responsive?: string;
  className?: string;
  refreshInterval?: number; // Optional: Default 30000ms (30s)
}

const AdSenseBanner: React.FC<AdSenseBannerProps> = ({ 
  dataAdSlot, 
  format = "auto", 
  responsive = "true",
  className,
  refreshInterval = 30000 
}) => {
  // We use a key to force React to unmount and remount the component, 
  // which triggers the ad script to fetch a new ad.
  const [adKey, setAdKey] = useState(0);

  useEffect(() => {
    // Set up the timer to refresh the ad
    const timer = setInterval(() => {
      setAdKey(prev => prev + 1);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [refreshInterval]);

  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error("AdSense Error:", err);
    }
  }, [adKey]); // Re-run when adKey changes

  return (
    <div 
      key={adKey} 
      className={`w-full overflow-hidden text-center flex items-center justify-center bg-white/5 rounded-lg border border-white/5 ${className || 'my-4 min-h-[100px]'}`}
    >
       {/* Use a real ins tag for production, or this placeholder for dev */}
       <div className="text-xs text-white/20 uppercase tracking-widest p-4">
         Ad Space ({dataAdSlot})<br/>
         <span className="opacity-50 text-[10px]">Refreshing in 30s...</span>
       </div>
       
       {/* 
          // UNCOMMENT THIS FOR REAL PRODUCTION ADS
          <ins className="adsbygoogle"
               style={{ display: 'block', width: '100%', height: '100%' }}
               data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" 
               data-ad-slot={dataAdSlot}
               data-ad-format={format}
               data-full-width-responsive={responsive}></ins>
       */}
    </div>
  );
};

export default AdSenseBanner;