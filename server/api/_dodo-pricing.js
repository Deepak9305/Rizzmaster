// Public price previews contain no account data. Checkout revalidates the billing country.
export const getPricingCountry = (req) => {
  const country = req.headers?.['x-vercel-ip-country'];
  return typeof country === 'string' && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null;
};

export const countryPricing = (country) => country ? { billing_address: { country } } : {};

export const formatDodoQuote = (quote) => {
  const currency = quote.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid quote currency');
  const fractionDigits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const format = (minor) => {
    if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('Invalid quote amount');
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'symbol' }).format(minor / 10 ** fractionDigits);
  };
  // Display Dodo's recurring amount; trials may have a different first payment.
  const recurring = quote.recurring_breakup?.total_amount;
  if (recurring == null) throw new Error('Missing subscription renewal quote');
  return { price: format(recurring), currency, dueToday: format(quote.current_breakup.total_amount), trialDays: quote.trial_period_days || 0 };
};

const quotes = new Map();
export const getDodoQuote = async (client, productId, country) => {
  const key = `${productId}:${country}`;
  const cached = quotes.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = client.checkoutSessions.preview({
    product_cart: [{ product_id: productId, quantity: 1 }],
    ...countryPricing(country),
  }, { timeout: 10000, maxRetries: 0 }).then(formatDodoQuote);
  quotes.set(key, { promise, expires: Date.now() + 60000 });
  try { return await promise; } catch (error) { quotes.delete(key); throw error; }
};
