import React, { startTransition, useCallback, useEffect, useState } from 'react';
import App from '../App';
import { isMarketingPath, normalizeMarketingPath } from '../services/marketingRoutes';
import MarketingSite from './MarketingSite';

const getBrowserLocation = () => {
  const pathname = normalizeMarketingPath(window.location.pathname);
  return `${pathname}${window.location.hash}`;
};

const getPathname = (location: string) => normalizeMarketingPath(location.split('#')[0]);

const getNavigationTarget = (path: string) => {
  const url = new URL(path, window.location.origin);
  const pathname = normalizeMarketingPath(url.pathname);
  return `${pathname}${url.hash}`;
};

const scrollToTarget = (location: string) => {
  const hash = location.split('#')[1];
  window.setTimeout(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  }, 0);
};

const WebRouter: React.FC = () => {
  const [location, setLocation] = useState(getBrowserLocation);
  const pathname = getPathname(location);
  const [hasVisitedApp, setHasVisitedApp] = useState(() => !isMarketingPath(pathname));
  const isMarketingPage = isMarketingPath(pathname);

  useEffect(() => {
    const handlePopState = () => {
      const nextLocation = getBrowserLocation();
      startTransition(() => setLocation(nextLocation));
      scrollToTarget(nextLocation);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isMarketingPage) {
      setHasVisitedApp(true);
    }
  }, [isMarketingPage]);

  const navigate = useCallback((path: string) => {
    const nextLocation = getNavigationTarget(path);
    if (nextLocation === getBrowserLocation()) {
      scrollToTarget(nextLocation);
      return;
    }

    const nextPathname = getPathname(nextLocation);
    if (!isMarketingPath(nextPathname)) setHasVisitedApp(true);
    window.history.pushState({ ...(window.history.state || {}), webRoute: true }, '', nextLocation);
    startTransition(() => setLocation(nextLocation));
    scrollToTarget(nextLocation);
  }, []);

  return (
    <>
      {hasVisitedApp && (
        <div hidden={isMarketingPage}>
          <App onNavigateToPath={navigate} />
        </div>
      )}
      {isMarketingPage && <MarketingSite key={location} onNavigateToPath={navigate} />}
    </>
  );
};

export default WebRouter;
