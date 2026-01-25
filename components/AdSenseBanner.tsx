import React, { useEffect } from 'react';

interface AdSenseBannerProps {
  dataAdSlot: string;
  format?: string;
  responsive?: string;
}

const AdSenseBanner: React.FC<AdSenseBannerProps> = ({ 
  dataAdSlot, 
  format = "auto", 
  responsive = "true" 
}) => {
  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error("AdSense Error:", err);
    }
  }, []);

  return (
    <div className="w-full overflow-hidden text-center my-4 min-h-[100px] flex items-center justify-center bg-white/5 rounded-lg border border-white/5">
       <div className="text-xs text-white/20 uppercase tracking-widest p-4">
         Ad Space ({dataAdSlot})<br/>
         <span className="opacity-50 text-[10px]">Real ads would load here</span>
       </div>
    </div>
  );
};

export default AdSenseBanner;