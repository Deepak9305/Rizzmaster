import { applyCors } from './_cors.js';
import {
  authenticateBillingRequest,
  dodoConfig,
  getManageableDodoSubscription,
  getDodoClient,
  isDodoPortalConfigured,
  json,
  safeDodoError,
} from './_dodo.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const auth = await authenticateBillingRequest(req);
  if (!auth.user) return json(res, 401, { error: auth.error, code: 'LOGIN_REQUIRED' });
  if (!isDodoPortalConfigured()) return json(res, 503, { error: 'Web billing is unavailable.', code: 'DODO_CONFIG_MISSING' });

  try {
    const subscription = await getManageableDodoSubscription(auth.user.id);
    if (!subscription?.dodo_customer_id) {
      return json(res, 404, { error: 'No active web subscription was found.', code: 'DODO_SUBSCRIPTION_NOT_FOUND' });
    }
    const session = await getDodoClient().customers.customerPortal.create(
      subscription.dodo_customer_id,
      { return_url: dodoConfig.returnUrl, send_email: false }
    );
    return json(res, 200, { portalUrl: session.link });
  } catch (error) {
    const safe = safeDodoError(error);
    console.error('[Dodo Portal] Failed.', {
      userId: auth.user.id,
      code: safe.code,
      statusCode: safe.statusCode,
      message: safe.message,
    });
    return json(res, 502, { error: 'Could not open the billing portal.', code: 'DODO_PORTAL_FAILED' });
  }
}
