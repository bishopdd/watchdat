import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { TrackedShow, WatchActivityItem } from '../types/tv';

const SUPABASE_URL = 'https://qsplvkggcifngglqqiep.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_irizvOqUqSDaQPy74BH59w_WEb3CkKz';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' })
  }
});

export function getSupabaseClient(): SupabaseClient {
  return supabase;
}

export async function getCurrentSessionUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ user: User | null; needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password
  });

  if (error) throw error;
  const needsEmailConfirmation = Boolean(data.user && !data.session);
  return { user: data.user, needsEmailConfirmation };
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  if (error) throw error;
  if (!data.user) throw new Error('Login failed.');
  return data.user;
}

export async function signOutUser(): Promise<void> {
  await supabase.auth.signOut();
}

export interface CloudWatchlistRecord {
  shows: TrackedShow[];
  activity: WatchActivityItem[];
  updatedAt: string | null;
}

// Compact episode objects for fast, reliable cloud sync (avoids multi-MB HTML summary payloads)
function compactShowsForCloud(shows: TrackedShow[]): TrackedShow[] {
  return shows.map((s) => ({
    ...s,
    episodes: (s.episodes || []).map((ep) => ({
      id: ep.id,
      name: ep.name,
      season: ep.season,
      number: ep.number,
      airdate: ep.airdate,
      airtime: ep.airtime,
      airstamp: ep.airstamp,
      runtime: ep.runtime,
      image: ep.image,
      summary: null
    }))
  }));
}

export async function pullCloudWatchlist(userId: string): Promise<CloudWatchlistRecord | null> {
  const { data, error } = await supabase
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
  const nowIso = new Date().toISOString();
  const compactedShows = compactShowsForCloud(shows);

  const { error } = await supabase.from('user_watchlists').upsert(
    {
      user_id: userId,
      shows: compactedShows,
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
    if (cShow && typeof cShow.id === 'number') {
      showMap.set(cShow.id, cShow);
    }
  }

  // Merge local shows on top (unioning watched episodes so no progress is ever lost)
  for (const lShow of localShows) {
    if (!lShow || typeof lShow.id !== 'number') continue;
    const existing = showMap.get(lShow.id);
    if (!existing) {
      showMap.set(lShow.id, lShow);
    } else {
      const unionWatched = Array.from(
        new Set([...(existing.watchedEpisodeIds || []), ...(lShow.watchedEpisodeIds || [])])
      );
      // Prefer whichever show object has fuller episode details for base metadata
      const baseShow =
        (lShow.episodes?.length || 0) >= (existing.episodes?.length || 0) ? lShow : existing;
      const isLocalNewer = (lShow.lastUpdated || 0) >= (existing.lastUpdated || 0);
      const newerShow = isLocalNewer ? lShow : existing;

      showMap.set(lShow.id, {
        ...baseShow,
        manualStatus: newerShow.manualStatus ?? lShow.manualStatus ?? 'auto',
        watchedEpisodeIds: unionWatched,
        userRating: newerShow.userRating ?? lShow.userRating ?? existing.userRating,
        userNotes: newerShow.userNotes ?? lShow.userNotes ?? existing.userNotes,
        favorite: newerShow.favorite ?? Boolean(lShow.favorite || existing.favorite),
        lastUpdated: Math.max(lShow.lastUpdated || 0, existing.lastUpdated || 0),
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
    const aTime = a.lastWatchedAt || a.addedAt || 0;
    const bTime = b.lastWatchedAt || b.addedAt || 0;
    return bTime - aTime;
  });

  return { mergedShows, mergedActivity };
}

/**
 * Safely pulls from Supabase, merges with local shows/activity, and pushes back
 * to Supabase so neither device ever overwrites the other with an empty array.
 */
export async function syncWithCloudSafe(
  userId: string,
  localShows: TrackedShow[],
  localActivity: WatchActivityItem[]
): Promise<{
  mergedShows: TrackedShow[];
  mergedActivity: WatchActivityItem[];
  syncedAt: string;
}> {
  const cloudRecord = await pullCloudWatchlist(userId);
  const cloudShows = cloudRecord?.shows || [];
  const cloudActivity = cloudRecord?.activity || [];

  const { mergedShows, mergedActivity } = mergeLocalAndCloudWatchlists(
    localShows,
    cloudShows,
    localActivity,
    cloudActivity
  );

  // Push merged state back if local added anything or if no cloud record existed yet
  const shouldPush =
    !cloudRecord ||
    mergedShows.length !== cloudShows.length ||
    localShows.length > 0;

  let syncedAt = cloudRecord?.updatedAt || new Date().toISOString();
  if (shouldPush) {
    syncedAt = await pushCloudWatchlist(userId, mergedShows, mergedActivity);
  }

  return {
    mergedShows,
    mergedActivity,
    syncedAt
  };
}
