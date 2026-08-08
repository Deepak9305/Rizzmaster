import { applyCors } from './_cors.js';
import {
  authenticateBillingRequest,
  dodoConfig,
  isDodoConfigured,
  json,
} from './_dodo.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });

  const auth = await authenticateBillingRequest(req);
  if (!auth.user) return json(res, 401, { error: auth.error, code: 'LOGIN_REQUIRED' });

  return json(res, 200, {
    enabled: isDodoConfigured(),
    currency: 'USD',
    plans: Object.entries(dodoConfig.products).map(([id, plan]) => ({
      id,
      label: plan.label,
      price: plan.price,
      interval: plan.interval,
      available: Boolean(plan.id),
    })),
  });
}
