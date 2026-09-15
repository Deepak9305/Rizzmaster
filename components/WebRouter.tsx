import React, { lazy, startTransition, Suspense, useCallback, useEffect, useState } from 'react';
import { isMarketingPath, normalizeMarketingPath } from '../services/marketingRoutes';

const App = lazy(() => import('../App'));
const MarketingSite = lazy(() => import('./MarketingSite'));
const BillingReturnPage = lazy(() => import('./BillingReturnPage'));

const getPathname = () => normalizeMarketingPath(window.location.pathname);
const isBillingReturnPath = (pathname: string) => pathname.toLowerCase() === '/billing/return';

const WebRouter: React.FC = () => {
  const [pathname, setPathname] = useState(getPathname);
  const [hasVisitedApp, setHasVisitedApp] = useState(() => {
    const initialPath = getPathname();
    return !isMarketingPath(initialPath) && !isBillingReturnPath(initialPath);
  });
  const isMarketingPage = isMarketingPath(pathname);
  const isBillingReturnPage = isBillingReturnPath(pathname);

  useEffect(() => {
    const handlePopState = () => {
      const nextPathname = getPathname();
      startTransition(() => setPathname(nextPathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isMarketingPage && !isBillingReturnPage) {
      setHasVisitedApp(true);
    }
  }, [isBillingReturnPage, isMarketingPage]);

  const navigate = useCallback((path: string) => {
    const nextPathname = normalizeMarketingPath(path);
    if (nextPathname === getPathname()) return;

    window.history.pushState({}, '', nextPathname);
    startTransition(() => setPathname(nextPathname));
  }, []);

  return (
    <>
      {hasVisitedApp && (
        <div hidden={isMarketingPage || isBillingReturnPage}>
          <Suspense fallback={null}>
            <App onNavigateToPath={navigate} />
          </Suspense>
        </div>
      )}
      {isMarketingPage && (
        <Suspense fallback={<div className="min-h-screen bg-black" />}>
          <MarketingSite />
        </Suspense>
      )}
      {isBillingReturnPage && (
        <Suspense fallback={<div className="min-h-screen bg-black" />}>
          <BillingReturnPage onContinue={() => navigate('/')} />
        </Suspense>
      )}
    </>
  );
};

export default WebRouter;
