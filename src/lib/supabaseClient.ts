// supabase-js is loaded from a CDN (see the <script> tag in index.html),
// not installed as an npm dependency, so there are no local types for it —
// the client is typed loosely here and the rest of the app relies on our
// own types (src/types.ts) instead.
declare global {
  interface Window {
    supabase?: {
      createClient: (url: string, key: string, options?: Record<string, unknown>) => SupabaseClient;
    };
  }
}

export interface SupabaseClient {
  auth: {
    getSession: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
    onAuthStateChange: (
      callback: (event: string, session: Session | null) => void,
    ) => { data: { subscription: { unsubscribe: () => void } } };
    signInWithPassword: (credentials: { email: string; password: string }) => Promise<{ error: Error | null }>;
    signOut: () => Promise<{ error: Error | null }>;
    updateUser: (attrs: { password: string }) => Promise<{ error: Error | null }>;
    resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => Promise<{ error: Error | null }>;
  };
  from: (table: string) => SupabaseQueryBuilder;
  channel: (name: string) => SupabaseRealtimeChannel;
  removeChannel: (channel: SupabaseRealtimeChannel) => void;
}

export interface Session {
  user: { id: string; email?: string };
}

// A deliberately loose chainable query-builder shape — just enough of
// supabase-js's postgrest-js surface for the calls src/lib/db.ts makes.
export interface SupabaseQueryBuilder {
  select: (columns?: string) => SupabaseQueryBuilder;
  insert: (values: object | object[]) => SupabaseQueryBuilder;
  update: (values: Record<string, unknown>) => SupabaseQueryBuilder;
  delete: () => SupabaseQueryBuilder;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder;
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQueryBuilder;
  then: Promise<{ data: unknown; error: Error | null }>['then'];
}

export interface SupabaseRealtimeChannel {
  on: (
    event: 'postgres_changes',
    filter: { event: '*'; schema: 'public'; table: string },
    callback: () => void,
  ) => SupabaseRealtimeChannel;
  subscribe: () => SupabaseRealtimeChannel;
}

const SUPABASE_URL = 'https://kjbhexhazwrzdydayubg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lNnosGNwmhuzFIV4B36fAw_-ZOfzcwW';

if (!window.supabase) {
  throw new Error('supabase-js failed to load from the CDN.');
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
