import { handleApiRequest } from '../server/api/_http-server.js';

// All public API paths share one Vercel Function. Raw bodies remain untouched
// until the route handler verifies webhooks or parses JSON itself.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const routeValue = Array.isArray(req.query?.__route)
    ? req.query.__route[0]
    : req.query?.__route;
  const routePath = routeValue ? `/api/${String(routeValue).replace(/^\/+/, '')}` : '';

  return handleApiRequest(req, res, { routePath });
}
