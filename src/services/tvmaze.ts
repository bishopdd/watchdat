import {
  TVMazeEpisode,
  TVMazeRawShow,
  TrackedShow,
  WatchlistTab,
  ManualWatchStatus
} from '../types/tv';

const BASE_URL = 'https://api.tvmaze.com';

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function formatEpisodeCode(season: number, number: number | null): string {
  const s = String(season ?? 1).padStart(2, '0');
  const e = number != null ? String(number).padStart(2, '0') : 'SP';
  return `S${s}E${e}`;
}

export function getEpisodeAirDate(ep: TVMazeEpisode): Date | null {
  if (ep.airstamp) {
    const d = new Date(ep.airstamp);
    if (!isNaN(d.getTime())) return d;
  }
  if (ep.airdate) {
    const timePart = ep.airtime && ep.airtime.includes(':') ? ep.airtime : '20:00';
    const d = new Date(`${ep.airdate}T${timePart}:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function isEpisodeAired(ep: TVMazeEpisode, now: Date = new Date()): boolean {
  const airDate = getEpisodeAirDate(ep);
  if (!airDate) return false;
  return airDate.getTime() <= now.getTime();
}

export function sortEpisodes(episodes: TVMazeEpisode[]): TVMazeEpisode[] {
  return [...episodes].sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return (a.number ?? 0) - (b.number ?? 0);
  });
}

export function getNextEpisodeToWatch(
  show: TrackedShow,
  now: Date = new Date()
): TVMazeEpisode | null {
  const watchedSet = new Set(show.watchedEpisodeIds);
  const sorted = sortEpisodes(show.episodes);
  for (const ep of sorted) {
    if (isEpisodeAired(ep, now) && !watchedSet.has(ep.id)) {
      return ep;
    }
  }
  return null;
}

export function getFirstUnwatchedEpisodeAny(show: TrackedShow): TVMazeEpisode | null {
  const watchedSet = new Set(show.watchedEpisodeIds);
  const sorted = sortEpisodes(show.episodes);
  for (const ep of sorted) {
    if (!watchedSet.has(ep.id)) {
      return ep;
    }
  }
  return null;
}

export function getNextUpcomingEpisode(
  show: TrackedShow,
  now: Date = new Date()
): TVMazeEpisode | null {
  const futureEpisodes = show.episodes
    .map((ep) => ({ ep, date: getEpisodeAirDate(ep) }))
    .filter((item): item is { ep: TVMazeEpisode; date: Date } => {
      return item.date !== null && item.date.getTime() > now.getTime();
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return futureEpisodes.length > 0 ? futureEpisodes[0].ep : null;
}

export function getShowProgress(show: TrackedShow, now: Date = new Date()) {
  const watchedSet = new Set(show.watchedEpisodeIds);
  const totalEpisodes = show.episodes.length;
  const airedEpisodesList = show.episodes.filter((ep) => isEpisodeAired(ep, now));
  const airedEpisodes = airedEpisodesList.length;
  const watchedAiredCount = airedEpisodesList.filter((ep) => watchedSet.has(ep.id)).length;
  const watchedCount = show.episodes.filter((ep) => watchedSet.has(ep.id)).length;
  const remainingToWatch = Math.max(0, airedEpisodes - watchedAiredCount);

  const percentAired =
    airedEpisodes > 0 ? Math.round((watchedAiredCount / airedEpisodes) * 100) : 0;
  const percentTotal =
    totalEpisodes > 0 ? Math.round((watchedCount / totalEpisodes) * 100) : 0;

  return {
    totalEpisodes,
    airedEpisodes,
    watchedCount,
    watchedAiredCount,
    remainingToWatch,
    percentAired,
    percentTotal
  };
}

export function getComputedWatchTab(
  show: TrackedShow,
  now: Date = new Date()
): Exclude<WatchlistTab, 'all'> {
  if (show.manualStatus === 'watch_later' && show.watchedEpisodeIds.length === 0) {
    return 'watch_later';
  }

  const { remainingToWatch, airedEpisodes } = getShowProgress(show, now);
  const nextUpcoming = getNextUpcomingEpisode(show, now);

  if (remainingToWatch > 0) {
    return 'watching';
  }

  // No remaining aired episodes to watch
  if (
    nextUpcoming !== null ||
    show.status === 'Running' ||
    show.status === 'To Be Determined' ||
    show.status === 'In Development' ||
    airedEpisodes === 0
  ) {
    return 'upcoming';
  }

  return 'completed';
}

export interface CountdownInfo {
  badge: string;
  detail: string;
  exactDateStr: string;
  timeStr: string;
  urgency: 'today' | 'tomorrow' | 'this_week' | 'later';
  diffMs: number;
  daysAway: number;
}

export function formatAirDateCountdown(
  ep: TVMazeEpisode,
  now: Date = new Date()
): CountdownInfo | null {
  const airDate = getEpisodeAirDate(ep);
  if (!airDate) return null;

  const diffMs = airDate.getTime() - now.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfAirDay = new Date(airDate.getFullYear(), airDate.getMonth(), airDate.getDate());
  const calendarDaysDiff = Math.round(
    (startOfAirDay.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timeStr = airDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });

  const exactDateStr = airDate.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: airDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });

  if (calendarDaysDiff === 0) {
    const hoursLeft = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
    const minsLeft = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
    const badge =
      diffMs <= 0
        ? 'Aired Today'
        : hoursLeft > 0
        ? `Today • in ${hoursLeft}h ${minsLeft}m`
        : `Today • in ${minsLeft}m`;
    return {
      badge,
      detail: `Airs today at ${timeStr}`,
      exactDateStr,
      timeStr,
      urgency: 'today',
      diffMs,
      daysAway: 0
    };
  }

  if (calendarDaysDiff === 1) {
    return {
      badge: 'Tomorrow',
      detail: `Tomorrow at ${timeStr}`,
      exactDateStr,
      timeStr,
      urgency: 'tomorrow',
      diffMs,
      daysAway: 1
    };
  }

  if (calendarDaysDiff > 1 && calendarDaysDiff <= 7) {
    const weekday = airDate.toLocaleDateString([], { weekday: 'long' });
    return {
      badge: `In ${calendarDaysDiff} days`,
      detail: `${weekday} at ${timeStr}`,
      exactDateStr,
      timeStr,
      urgency: 'this_week',
      diffMs,
      daysAway: calendarDaysDiff
    };
  }

  return {
    badge: calendarDaysDiff <= 60 ? `In ${calendarDaysDiff} days` : exactDateStr,
    detail: `${exactDateStr} at ${timeStr}`,
    exactDateStr,
    timeStr,
    urgency: 'later',
    diffMs,
    daysAway: calendarDaysDiff
  };
}

export function mapRawShowToTracked(
  raw: TVMazeRawShow,
  existing?: Partial<TrackedShow>,
  manualStatus: ManualWatchStatus = 'auto'
): TrackedShow {
  const networkName = raw.network?.name || raw.webChannel?.name || null;
  const averageRuntime = raw.averageRuntime || raw.runtime || 45;
  const episodes = sortEpisodes(raw._embedded?.episodes || existing?.episodes || []);

  // Ensure HTTPS image URLs for PWA security
  const normalizeImg = (img: { medium: string; original: string } | null) => {
    if (!img) return null;
    return {
      medium: img.medium?.replace(/^http:\/\//i, 'https://'),
      original: img.original?.replace(/^http:\/\//i, 'https://')
    };
  };

  const normalizedEpisodes: TVMazeEpisode[] = episodes.map((ep) => ({
    ...ep,
    image: normalizeImg(ep.image)
  }));

  return {
    id: raw.id,
    name: raw.name,
    image: normalizeImg(raw.image),
    status: raw.status || 'Unknown',
    premiered: raw.premiered,
    ended: raw.ended,
    networkName,
    officialSite: raw.officialSite,
    schedule: raw.schedule || { time: '', days: [] },
    averageRuntime,
    genres: raw.genres || [],
    summary: raw.summary,
    rating: raw.rating?.average ?? null,
    manualStatus: existing?.manualStatus ?? manualStatus,
    watchedEpisodeIds: existing?.watchedEpisodeIds ?? [],
    episodes: normalizedEpisodes,
    userRating: existing?.userRating,
    userNotes: existing?.userNotes,
    favorite: existing?.favorite ?? false,
    addedAt: existing?.addedAt ?? Date.now(),
    lastUpdated: Date.now(),
    lastWatchedAt: existing?.lastWatchedAt
  };
}

export async function searchShows(query: string): Promise<TVMazeRawShow[]> {
  if (!query.trim()) return [];
  const res = await fetch(`${BASE_URL}/search/shows?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  const data: Array<{ score: number; show: TVMazeRawShow }> = await res.json();
  return data.map((item) => {
    const show = item.show;
    if (show.image) {
      show.image = {
        medium: show.image.medium?.replace(/^http:\/\//i, 'https://'),
        original: show.image.original?.replace(/^http:\/\//i, 'https://')
      };
    }
    return show;
  });
}

export async function fetchShowWithEpisodes(
  showId: number,
  existing?: TrackedShow,
  manualStatus: ManualWatchStatus = 'auto'
): Promise<TrackedShow> {
  const res = await fetch(`${BASE_URL}/shows/${showId}?embed=episodes`);
  if (!res.ok) throw new Error(`Failed to load show #${showId}`);
  const raw: TVMazeRawShow = await res.json();
  return mapRawShowToTracked(raw, existing, manualStatus);
}

export async function fetchTodaySchedule(): Promise<
  Array<{ show: TVMazeRawShow; episode: TVMazeEpisode }>
> {
  const todayStr = new Date().toISOString().split('T')[0];
  const res = await fetch(`${BASE_URL}/schedule?country=US&date=${todayStr}`);
  if (!res.ok) return [];
  const data: Array<TVMazeEpisode & { show: TVMazeRawShow }> = await res.json();

  const seenShowIds = new Set<number>();
  const results: Array<{ show: TVMazeRawShow; episode: TVMazeEpisode }> = [];

  for (const item of data) {
    if (!item.show || seenShowIds.has(item.show.id)) continue;
    if (!item.show.image) continue;
    seenShowIds.add(item.show.id);
    if (item.show.image) {
      item.show.image = {
        medium: item.show.image.medium?.replace(/^http:\/\//i, 'https://'),
        original: item.show.image.original?.replace(/^http:\/\//i, 'https://')
      };
    }
    results.push({ show: item.show, episode: item });
    if (results.length >= 16) break;
  }

  return results;
}

export async function fetchWithRetry(url: string, maxRetries = 4): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url);
    if (res.status === 429 && attempt < maxRetries) {
      attempt++;
      // TVMaze rate limit is 20 req / 10s; wait before retrying
      await new Promise((r) => setTimeout(r, 1800 * attempt));
      continue;
    }
    return res;
  }
}

export async function resolveShowFromTVTime(params: {
  tvdbId?: number;
  imdbId?: string;
  showName?: string;
}): Promise<TVMazeRawShow | null> {
  const { tvdbId, imdbId, showName } = params;

  // 1. If we have a showName and NO tvdbId, singlesearch with embed=episodes takes only 1 request!
  if (!tvdbId && !imdbId && showName) {
    const res = await fetchWithRetry(
      `${BASE_URL}/singlesearch/shows?q=${encodeURIComponent(showName.trim())}&embed=episodes`
    );
    if (res.ok) {
      return (await res.json()) as TVMazeRawShow;
    }
  }

  // 2. Try TheTVDB lookup (TV Time uses TheTVDB series_id natively)
  if (tvdbId && tvdbId > 0) {
    const lookupRes = await fetchWithRetry(`${BASE_URL}/lookup/shows?thetvdb=${tvdbId}`);
    if (lookupRes.ok) {
      const basicShow: TVMazeRawShow = await lookupRes.json();
      const fullRes = await fetchWithRetry(`${BASE_URL}/shows/${basicShow.id}?embed=episodes`);
      if (fullRes.ok) {
        return (await fullRes.json()) as TVMazeRawShow;
      }
      return basicShow;
    }
  }

  // 3. Try IMDb lookup
  if (imdbId && imdbId.trim().startsWith('tt')) {
    const lookupRes = await fetchWithRetry(
      `${BASE_URL}/lookup/shows?imdb=${encodeURIComponent(imdbId.trim())}`
    );
    if (lookupRes.ok) {
      const basicShow: TVMazeRawShow = await lookupRes.json();
      const fullRes = await fetchWithRetry(`${BASE_URL}/shows/${basicShow.id}?embed=episodes`);
      if (fullRes.ok) {
        return (await fullRes.json()) as TVMazeRawShow;
      }
      return basicShow;
    }
  }

  // 4. Fallback to showName singlesearch with embedded episodes
  if (showName && showName.trim()) {
    const res = await fetchWithRetry(
      `${BASE_URL}/singlesearch/shows?q=${encodeURIComponent(showName.trim())}&embed=episodes`
    );
    if (res.ok) {
      return (await res.json()) as TVMazeRawShow;
    }
  }

  return null;
}

export async function fetchPopularShows(): Promise<TVMazeRawShow[]> {
  const res = await fetch(`${BASE_URL}/shows?page=0`);
  if (!res.ok) return [];
  const data: TVMazeRawShow[] = await res.json();
  return data
    .filter((s) => s.image && (s.rating?.average ?? 0) >= 8.0)
    .sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0))
    .slice(0, 24)
    .map((show) => ({
      ...show,
      image: show.image
        ? {
            medium: show.image.medium?.replace(/^http:\/\//i, 'https://'),
            original: show.image.original?.replace(/^http:\/\//i, 'https://')
          }
        : null
    }));
}

