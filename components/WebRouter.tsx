import React, { startTransition, useEffect, useState } from 'react';
import App from '../App';
import { isMarketingPath, normalizeMarketingPath } from '../services/marketingRoutes';
import MarketingSite from './MarketingSite';

const getPathname = () => normalizeMarketingPath(window.location.pathname);

const WebRouter: React.FC = () => {
  const [pathname, setPathname] = useState(getPathname);
  const [hasVisitedApp, setHasVisitedApp] = useState(() => !isMarketingPath(getPathname()));
  const isMarketingPage = isMarketingPath(pathname);

  useEffect(() => {
    const handlePopState = () => {
      const nextPathname = getPathname();
      startTransition(() => setPathname(nextPathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isMarketingPage) {
      setHasVisitedApp(true);
    }
  }, [isMarketingPage]);

  const navigate = (path: string) => {
    const nextPathname = normalizeMarketingPath(path);
    if (nextPathname === pathname) return;

    window.history.pushState({}, '', nextPathname);
    startTransition(() => setPathname(nextPathname));
  };

  return (
    <>
      {hasVisitedApp && (
        <div hidden={isMarketingPage}>
          <App onNavigateToPath={navigate} />
        </div>
      )}
      {isMarketingPage && <MarketingSite />}
    </>
  );
};

export default WebRouter;
