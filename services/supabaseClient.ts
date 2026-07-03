import { createClient } from '@supabase/supabase-js';
import { runtimeConfig } from './runtimeConfig';
import {
  getCurrentSession,
  signInWithEmail,
  signInWithGoogleIdToken,
  signInWithGooglePopup,
  signOutCurrentUser,
  signUpWithEmail,
  subscribeToAuthChanges,
} from './firebaseClient';
import { parseBackendError, requestBackend } from './backendApi';

type CompatResult<T = any> = Promise<{ data: T | null; error: any }>;

const buildError = (message: string, code?: string) => ({
  message,
  code: code || message,
});

const withResult = async <T>(work: () => Promise<T>) => {
  try {
    return { data: await work(), error: null };
  } catch (error: any) {
    return { data: null, error: buildError(error?.message || 'Request failed.') };
  }
};

class CompatQueryBuilder {
  private filters = new Map<string, any>();
  private orderBy?: { column: string; ascending: boolean };
  private payload: any = null;
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';

  constructor(private readonly table: string) {}

  select(..._args: any[]) {
    this.action = 'select';
    return this;
  }

  insert(payload: any) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(payload: any, _options?: any) {
    this.action = 'upsert';
    this.payload = payload;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.set(column, value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  single() {
    return this.execute();
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ) {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null) {
    return this.execute().finally(onfinally);
  }

  private async execute(): CompatResult<any> {
    return withResult(async () => {
      switch (this.table) {
        case 'profiles':
          return this.executeProfiles();
        case 'saved_items':
          return this.executeSavedItems();
        case 'reports':
          return this.executeReports();
        case 'user_activity_log':
          return this.executeActivityLog();
        default:
          throw new Error(`Unsupported table '${this.table}' in Firebase compatibility client.`);
      }
    });
  }

  private async executeProfiles() {
    if (this.action === 'select') {
      const { response, data } = await requestBackend<{ profile: any }>('/api/profile', { method: 'GET' });
      if (!response.ok) {
        throw new Error(parseBackendError(response.status, data, 'Failed to load profile.'));
      }
      return data?.profile || null;
    }

    if (this.action === 'insert') {
      const profile = Array.isArray(this.payload) ? this.payload[0] : this.payload;
      const { response, data } = await requestBackend<{ profile: any }>('/api/profile', {
        method: 'POST',
        bodyJson: { action: 'create', profile },
      });
      if (!response.ok) {
        throw new Error(parseBackendError(response.status, data, 'Failed to create profile.'));
      }
      return data?.profile || null;
    }

    if (this.action === 'update') {
      const { response, data } = await requestBackend<{ profile: any }>('/api/profile', {
        method: 'PATCH',
        bodyJson: this.payload,
      });
      if (!response.ok) {
        throw new Error(parseBackendError(response.status, data, 'Failed to update profile.'));
      }
      return data?.profile || null;
    }

    throw new Error(`Unsupported profiles action '${this.action}'.`);
  }

  private async executeSavedItems() {
    if (this.action === 'select') {
      const params = new URLSearchParams();
      if (this.orderBy?.column) {
        params.set('orderBy', this.orderBy.column);
        params.set('ascending', this.orderBy.ascending ? 'true' : 'false');
      }

      const suffix = params.toString() ? `?${params.toString()}` : '';
      const { response, data } = await requestBackend<{ items: any[] }>(`/api/saved-items${suffix}`, { method: 'GET' });
      if (!response.ok) {
        throw new Error(parseBackendError(response.status, data, 'Failed to load saved items.'));
      }
      return data?.items || [];
    }

    if (this.action === 'insert') {
      const item = Array.isArray(this.payload) ? this.payload[0] : this.payload;
      const { response, data } = await requestBackend<{ item: any }>('/api/saved-items', {
        method: 'POST',
        bodyJson: item,
      });
      if (!response.ok) {
        throw new Error(parseBackendError(response.status, data, 'Failed to save item.'));
      }
      return data?.item || null;
    }

    if (this.action === 'delete') {
      const itemId = this.filters.get('id');
      const query = itemId ? `?id=${encodeURIComponent(String(itemId))}` : '';
      const { response, data } = await requestBackend(`/api/saved-items${query}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(parseBackendError(response.status, data, 'Failed to delete item.'));
      }
      return null;
    }

    throw new Error(`Unsupported saved_items action '${this.action}'.`);
  }

  private async executeReports() {
    if (this.action !== 'insert') {
      throw new Error(`Unsupported reports action '${this.action}'.`);
    }

    const report = Array.isArray(this.payload) ? this.payload[0] : this.payload;
    const { response, data } = await requestBackend('/api/reports', {
      method: 'POST',
      bodyJson: report,
      requireAuth: report?.user_id !== null,
    });

    if (!response.ok) {
      throw new Error(parseBackendError(response.status, data, 'Failed to submit report.'));
    }

    return null;
  }

  private async executeActivityLog() {
    if (this.action !== 'upsert') {
      throw new Error(`Unsupported user_activity_log action '${this.action}'.`);
    }

    const entry = Array.isArray(this.payload) ? this.payload[0] : this.payload;
    const { response, data } = await requestBackend('/api/activity', {
      method: 'POST',
      bodyJson: {
        activeDate: entry?.active_date,
      },
    });

    if (!response.ok) {
      throw new Error(parseBackendError(response.status, data, 'Failed to track activity.'));
    }

    return null;
  }
}

const firebaseCompatClient = {
  auth: {
    async getSession() {
      return {
        data: {
          session: await getCurrentSession(),
        },
      };
    },
    async refreshSession() {
      return {
        data: {
          session: await getCurrentSession(true),
        },
        error: null,
      };
    },
    onAuthStateChange(callback: (event: string, session: any) => void) {
      return {
        data: {
          subscription: subscribeToAuthChanges((event, session) => callback(event, session)),
        },
      };
    },
    async signOut() {
      await signOutCurrentUser();
      return { error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      return withResult(async () => {
        await signInWithEmail(email, password);
        return null;
      });
    },
    async signUp({ email, password }: { email: string; password: string }) {
      return withResult(async () => {
        await signUpWithEmail(email, password);
        return null;
      });
    },
    async signInWithIdToken({ provider, token }: { provider: string; token: string }) {
      if (provider !== 'google') {
        return { data: null, error: buildError('Unsupported identity provider.') };
      }

      return withResult(async () => {
        await signInWithGoogleIdToken(token);
        return null;
      });
    },
    async signInWithOAuth({ provider }: { provider: string; options?: any }) {
      if (provider !== 'google') {
        return { data: null, error: buildError('Unsupported identity provider.') };
      }

      return withResult(async () => {
        await signInWithGooglePopup();
        return null;
      });
    },
  },
  from(table: string) {
    return new CompatQueryBuilder(table);
  },
  async rpc(name: string, params: Record<string, any> = {}) {
    return withResult(async () => {
      switch (name) {
        case 'claim_daily_credits_and_streak': {
          const { response, data } = await requestBackend('/api/profile/claim-daily', {
            method: 'POST',
          });
          if (!response.ok) {
            throw new Error(parseBackendError(response.status, data, 'Failed to claim daily credits.'));
          }
          return data;
        }
        case 'increment_total_time_spent': {
          const { response, data } = await requestBackend('/api/activity/time', {
            method: 'POST',
            bodyJson: {
              inputMs: params.input_ms,
            },
          });
          if (!response.ok) {
            throw new Error(parseBackendError(response.status, data, 'Failed to update time spent.'));
          }
          return data?.totalTimeSpentMs ?? null;
        }
        default:
          throw new Error(`Unsupported RPC '${name}'.`);
      }
    });
  },
};

const legacySupabaseClient = (runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey)
  ? createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const supabase = runtimeConfig.firebaseAuthAvailable
  ? firebaseCompatClient
  : legacySupabaseClient;
