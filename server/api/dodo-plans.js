import { applyCors } from './_cors.js';
import {
  getDodoClient,
  dodoConfig,
  isDodoConfigured,
  json,
} from './_dodo.js';
import { getDodoQuote, getPricingCountry } from './_dodo-pricing.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });

  res.setHeader('Cache-Control', 'private, no-store');
  const country = getPricingCountry(req);
  const enabled = isDodoConfigured();
  const plans = await Promise.all(Object.entries(dodoConfig.products).map(async ([id, plan]) => {
    let quote = null;
    if (enabled && plan.id && country) {
      try { quote = await getDodoQuote(getDodoClient(), plan.id, country); }
      catch { console.warn('[Dodo Pricing] Preview unavailable.', { plan: id, country }); }
    }
    return { id, label: plan.label, interval: plan.interval, price: null, ...quote, available: enabled && Boolean(plan.id) };
  }));
  return json(res, 200, {
    enabled,
    country,
    plans,
  });
}
