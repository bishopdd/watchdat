import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { TrackedShow, WatchActivityItem } from '../types/tv';

const LS_SUPABASE_URL = 'watchdat_supabase_url';
const LS_SUPABASE_ANON_KEY = 'watchdat_supabase_anon_key';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

export const SUPABASE_SQL_SETUP_SCRIPT = `create table if not exists public.user_watchlists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shows jsonb not null default '[]'::jsonb,
  activity jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_watchlists enable row level security;

create policy "Users can view their own watchlist"
  on public.user_watchlists for select
  using (auth.uid() = user_id);

create policy "Users can insert their own watchlist"
  on public.user_watchlists for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own watchlist"
  on public.user_watchlists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`;

export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

  const storedUrl = localStorage.getItem(LS_SUPABASE_URL)?.trim() || '';
  const storedKey = localStorage.getItem(LS_SUPABASE_ANON_KEY)?.trim() || '';

  const url = storedUrl || envUrl;
  const anonKey = storedKey || envKey;

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey && url.startsWith('https://'))
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(LS_SUPABASE_URL, url.trim());
  localStorage.setItem(LS_SUPABASE_ANON_KEY, anonKey.trim());
  cachedClient = null;
  cachedConfigKey = '';
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  const key = `${url}::${anonKey}`;
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    cachedConfigKey = key;
  }
  return cachedClient;
}

export async function getCurrentSessionUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ user: User | null; needsEmailConfirmation: boolean }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured yet.');

  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password
  });

  if (error) throw error;
  const needsEmailConfirmation = Boolean(data.user && !data.session);
  return { user: data.user, needsEmailConfirmation };
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured yet.');

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  if (error) throw error;
  if (!data.user) throw new Error('Login failed.');
  return data.user;
}

export async function signOutUser(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export interface CloudWatchlistRecord {
  shows: TrackedShow[];
  activity: WatchActivityItem[];
  updatedAt: string | null;
}

export async function pullCloudWatchlist(userId: string): Promise<CloudWatchlistRecord | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from('user_watchlists')
    .select('shows, activity, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  return {
    shows: Array.isArray(data.shows) ? (data.shows as TrackedShow[]) : [],
    activity: Array.isArray(data.activity) ? (data.activity as WatchActivityItem[]) : [],
    updatedAt: data.updated_at || null
  };
}

export async function pushCloudWatchlist(
  userId: string,
  shows: TrackedShow[],
  activity: WatchActivityItem[]
): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const nowIso = new Date().toISOString();
  const { error } = await client.from('user_watchlists').upsert(
    {
      user_id: userId,
      shows,
      activity: activity.slice(0, 150),
      updated_at: nowIso
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw error;
  }

  return nowIso;
}

export function mergeLocalAndCloudWatchlists(
  localShows: TrackedShow[],
  cloudShows: TrackedShow[],
  localActivity: WatchActivityItem[],
  cloudActivity: WatchActivityItem[]
): { mergedShows: TrackedShow[]; mergedActivity: WatchActivityItem[] } {
  const showMap = new Map<number, TrackedShow>();

  // Seed with cloud shows first
  for (const cShow of cloudShows) {
    showMap.set(cShow.id, cShow);
  }

  // Merge local shows on top (unioning watched episodes so no progress is ever lost)
  for (const lShow of localShows) {
    const existing = showMap.get(lShow.id);
    if (!existing) {
      showMap.set(lShow.id, lShow);
    } else {
      const unionWatched = Array.from(
        new Set([...existing.watchedEpisodeIds, ...lShow.watchedEpisodeIds])
      );
      const newerShow = (lShow.lastUpdated || 0) >= (existing.lastUpdated || 0) ? lShow : existing;
      showMap.set(lShow.id, {
        ...newerShow,
        watchedEpisodeIds: unionWatched,
        userRating: lShow.userRating ?? existing.userRating,
        userNotes: lShow.userNotes || existing.userNotes,
        favorite: Boolean(lShow.favorite || existing.favorite),
        lastWatchedAt: Math.max(lShow.lastWatchedAt || 0, existing.lastWatchedAt || 0) || undefined
      });
    }
  }

  const activityMap = new Map<string, WatchActivityItem>();
  for (const item of [...cloudActivity, ...localActivity]) {
    if (item && item.id) {
      activityMap.set(item.id, item);
    }
  }

  const mergedActivity = Array.from(activityMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 150);

  const mergedShows = Array.from(showMap.values()).sort((a, b) => {
    const aTime = a.lastWatchedAt || a.addedAt;
    const bTime = b.lastWatchedAt || b.addedAt;
    return bTime - aTime;
  });

  return { mergedShows, mergedActivity };
}
