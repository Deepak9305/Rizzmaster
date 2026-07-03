import { createClient } from '@supabase/supabase-js';
import { firebaseAuthAdmin, verifyFirebaseToken } from './_firebase.js';
import { isDatabaseConfigured } from './_db.js';
import {
  AppDataError,
  createReport,
  createSavedItem,
  deleteAccountData,
  deleteSavedItem,
  ensureUserProfile,
  getProfileById,
  incrementTotalTimeSpent,
  listSavedItems,
  modifyCredits,
  recordUserActivity,
  revokePremium,
  setPremium,
  updateProfile,
} from './_profiles.js';

const buildError = (message, code) => ({
  message,
  code: code || message,
  name: code || 'Error',
});

const buildUnauthorizedError = (message = 'Unauthorized') => buildError(message, 'LOGIN_REQUIRED');

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

class CompatQueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = new Map();
    this.orderBy = null;
    this.action = 'select';
    this.payload = null;
  }

  select() {
    this.action = 'select';
    return this;
  }

  insert(payload) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.set(column, value);
    return this;
  }

  order(column, options = {}) {
    this.orderBy = {
      column,
      ascending: options.ascending !== false,
    };
    return this;
  }

  is(column, value) {
    this.filters.set(column, value);
    return this;
  }

  single() {
    return this.execute();
  }

  maybeSingle() {
    return this.execute();
  }

  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch(onrejected) {
    return this.execute().catch(onrejected);
  }

  finally(onfinally) {
    return this.execute().finally(onfinally);
  }

  async execute() {
    try {
      let data = null;
      switch (this.table) {
        case 'profiles':
          data = await this.executeProfiles();
          break;
        case 'saved_items':
          data = await this.executeSavedItems();
          break;
        case 'reports':
          data = await this.executeReports();
          break;
        case 'user_activity_log':
          data = await this.executeUserActivity();
          break;
        default:
          throw buildError(`Unsupported server-side table '${this.table}'.`);
      }

      return { data, error: null };
    } catch (error) {
      if (error instanceof AppDataError) {
        return { data: null, error: buildError(error.message, error.code) };
      }
      return { data: null, error: buildError(error?.message || 'Request failed.') };
    }
  }

  async executeProfiles() {
    if (this.action === 'select') {
      const userId = this.filters.get('id');
      if (!userId) {
        throw buildError('Profile id filter is required.');
      }
      return getProfileById(userId);
    }

    if (this.action === 'insert') {
      const profile = Array.isArray(this.payload) ? this.payload[0] : this.payload;
      const result = await ensureUserProfile({ id: profile.id, email: profile.email || null });
      return result.profile;
    }

    if (this.action === 'update') {
      const userId = this.filters.get('id');
      if (!userId) {
        throw buildError('Profile id filter is required.');
      }
      return updateProfile(userId, this.payload || {});
    }

    if (this.action === 'delete') {
      const userId = this.filters.get('id');
      if (!userId) {
        throw buildError('Profile id filter is required.');
      }
      await deleteAccountData(userId);
      return null;
    }

    throw buildError(`Unsupported profiles action '${this.action}'.`);
  }

  async executeSavedItems() {
    if (this.action === 'select') {
      const userId = this.filters.get('user_id');
      if (!userId) {
        throw buildError('Saved items user_id filter is required.');
      }
      return listSavedItems(userId, { ascending: this.orderBy?.ascending === true });
    }

    if (this.action === 'insert') {
      const item = Array.isArray(this.payload) ? this.payload[0] : this.payload;
      return createSavedItem(item.user_id, item);
    }

    if (this.action === 'delete') {
      const itemId = this.filters.get('id');
      const userId = this.filters.get('user_id');
      if (!itemId) {
        throw buildError('Saved item id filter is required.');
      }
      await deleteSavedItem(userId || null, itemId);
      return null;
    }

    throw buildError(`Unsupported saved_items action '${this.action}'.`);
  }

  async executeReports() {
    if (this.action !== 'insert') {
      throw buildError(`Unsupported reports action '${this.action}'.`);
    }

    const report = Array.isArray(this.payload) ? this.payload[0] : this.payload;
    await createReport(report.user_id || null, report.content, report.type);
    return null;
  }

  async executeUserActivity() {
    if (this.action !== 'upsert') {
      throw buildError(`Unsupported user_activity_log action '${this.action}'.`);
    }

    const entry = Array.isArray(this.payload) ? this.payload[0] : this.payload;
    await recordUserActivity(entry.user_id, entry.active_date);
    return null;
  }
}

const rpcHandlers = {
  async admin_modify_credits(params) {
    const userId = params.user_uuid || params.p_user_id || params.user_id;
    const amountChange = params.amount_change ?? params.p_amount ?? params.amount;
    return modifyCredits(userId, amountChange);
  },
  async admin_set_premium(params) {
    return setPremium({
      userId: params.user_uuid,
      platformName: params.platform_name,
      productIdentifier: params.product_identifier,
      transactionIdentifier: params.transaction_identifier,
      basePlanIdentifier: params.base_plan_identifier,
      purchaseTokenIdentifier: params.purchase_token_identifier,
      expiresAt: params.expires_at,
      rawPayload: params.raw_payload,
    });
  },
  async admin_revoke_premium(params) {
    return revokePremium(params.user_uuid);
  },
  async claim_daily_credits_and_streak() {
    throw buildError('claim_daily_credits_and_streak is client-only in the server shim.');
  },
  async increment_total_time_spent(params) {
    return incrementTotalTimeSpent(params.user_id, params.input_ms);
  },
};

const createCompatClient = (isAdmin) => ({
  auth: isAdmin
    ? {
        admin: {
          async deleteUser(userId) {
            await firebaseAuthAdmin.deleteUser(userId);
            return { error: null };
          },
        },
      }
    : {
        async getUser(token) {
          try {
            const user = await verifyFirebaseToken(token);
            return { data: { user }, error: null };
          } catch (error) {
            if (legacySupabaseClient) {
              try {
                const { data, error: legacyError } = await legacySupabaseClient.auth.getUser(token);
                if (!legacyError && data?.user) {
                  return { data, error: null };
                }

                if (legacyError) {
                  return { data: null, error: buildUnauthorizedError(legacyError.message || 'Invalid token.') };
                }
              } catch (legacyLookupError) {
                return {
                  data: null,
                  error: buildUnauthorizedError(
                    legacyLookupError?.message || error?.message || 'Invalid token.'
                  ),
                };
              }
            }

            return { data: null, error: buildUnauthorizedError(error?.message || 'Invalid token.') };
          }
        },
      },
  from(table) {
    return new CompatQueryBuilder(table);
  },
  async rpc(name, params = {}) {
    try {
      const handler = rpcHandlers[name];
      if (!handler) {
        throw buildError(`Unsupported RPC '${name}'.`);
      }

      const data = await handler(params);
      return { data, error: null };
    } catch (error) {
      if (error instanceof AppDataError) {
        return { data: null, error: buildError(error.message, error.code) };
      }
      return { data: null, error: buildError(error?.message || `RPC '${name}' failed.`) };
    }
  },
});

const normalizeUrl = (value) => (value ? value.replace(/\/+$/, '') : value);
export const supabaseUrl = normalizeUrl(readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'REACT_APP_SUPABASE_URL'));
export const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'REACT_APP_SUPABASE_ANON_KEY');
export const supabaseServiceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

const createLegacyServerClient = (url, key) => createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const legacySupabaseClient = (supabaseUrl && supabaseAnonKey)
  ? createLegacyServerClient(supabaseUrl, supabaseAnonKey)
  : null;

const legacySupabaseAdminClient = (supabaseUrl && supabaseServiceKey)
  ? createLegacyServerClient(supabaseUrl, supabaseServiceKey)
  : null;

export const supabase = isDatabaseConfigured
  ? createCompatClient(false)
  : legacySupabaseClient;

export const supabaseAdmin = isDatabaseConfigured
  ? createCompatClient(true)
  : legacySupabaseAdminClient;
