import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Tv,
  Calendar,
  Compass,
  User as UserIcon,
  Plus,
  WifiOff,
  Smartphone,
  Sparkles,
  FileArchive,
  Cloud
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import {
  TrackedShow,
  TVMazeEpisode,
  WatchActivityItem,
  ManualWatchStatus
} from './types/tv';
import {
  fetchShowWithEpisodes,
  fetchTodaySchedule,
  isEpisodeAired,
  getNextEpisodeToWatch,
  getNextUpcomingEpisode,
  formatEpisodeCode
} from './services/tvmaze';
import {
  loadTrackedShows,
  saveTrackedShows,
  loadWatchActivity,
  saveWatchActivity,
  WatchDatBackupPayload
} from './services/storage';
import {
  getCurrentSessionUser,
  pushCloudWatchlist,
  syncWithCloudSafe
} from './services/supabase';
import { WatchlistView } from './components/WatchlistView';
import { UpcomingView } from './components/UpcomingView';
import { DiscoverView } from './components/DiscoverView';
import { StatsProfileView } from './components/StatsProfileView';
import { ShowDetailModal } from './components/ShowDetailModal';
import { TVTimeImportModal } from './components/TVTimeImportModal';
import { AuthModal } from './components/AuthModal';

type NavPage = 'shows' | 'upcoming' | 'discover' | 'profile';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function App() {
  const [activePage, setActivePage] = useState<NavPage>('shows');
  const [shows, setShows] = useState<TrackedShow[]>([]);
  const [activity, setActivity] = useState<WatchActivityItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<number | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isLoadingStarter, setIsLoadingStarter] = useState(false);
  const [isTVTimeImportOpen, setIsTVTimeImportOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const initialCloudSyncDone = useRef(false);
  const showsRef = useRef<TrackedShow[]>([]);
  const activityRef = useRef<WatchActivityItem[]>([]);
  showsRef.current = shows;
  activityRef.current = activity;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Listen for online/offline & PWA install prompt
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Load persisted data & perform initial two-way Supabase cloud sync on mount
  useEffect(() => {
    async function init() {
      const [loadedShows, loadedActivity, sessionUser] = await Promise.all([
        loadTrackedShows(),
        loadWatchActivity(),
        getCurrentSessionUser()
      ]);

      setShows(loadedShows);
      setActivity(loadedActivity);
      setIsLoaded(true);

      if (sessionUser) {
        setCurrentUser(sessionUser);
        setIsSyncingCloud(true);
        try {
          const { mergedShows, mergedActivity, syncedAt } = await syncWithCloudSafe(
            sessionUser.id,
            loadedShows,
            loadedActivity
          );
          setShows(mergedShows);
          setActivity(mergedActivity);
          setLastSyncedAt(syncedAt);
        } catch {
          // Offline or network error
        } finally {
          initialCloudSyncDone.current = true;
          setIsSyncingCloud(false);
        }
      } else {
        initialCloudSyncDone.current = true;
      }
    }
    init();
  }, []);

  // Persist shows locally whenever updated
  useEffect(() => {
    if (!isLoaded) return;
    saveTrackedShows(shows);
  }, [shows, isLoaded]);

  // Persist activity locally whenever updated
  useEffect(() => {
    if (!isLoaded) return;
    saveWatchActivity(activity);
  }, [activity, isLoaded]);

  // Automatic debounced Cloud Sync whenever shows or activity change after initial load
  useEffect(() => {
    if (!isLoaded || !currentUser || isOffline || !initialCloudSyncDone.current) return;
    // Never blindly push an empty array on startup; syncWithCloudSafe merges safely
    const timer = setTimeout(async () => {
      try {
        setIsSyncingCloud(true);
        const { mergedShows, mergedActivity, syncedAt } = await syncWithCloudSafe(
          currentUser.id,
          showsRef.current,
          activityRef.current
        );
        if (mergedShows.length !== showsRef.current.length) {
          setShows(mergedShows);
          setActivity(mergedActivity);
        }
        setLastSyncedAt(syncedAt);
      } catch {
        // Retry on next action
      } finally {
        setIsSyncingCloud(false);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [shows, activity, isLoaded, currentUser, isOffline]);

  // Auto-sync when switching back to the app window/tab on any device
  useEffect(() => {
    if (!currentUser) return;
    const handleVisibilityOrFocus = async () => {
      if (document.visibilityState === 'visible' && navigator.onLine && initialCloudSyncDone.current) {
        try {
          setIsSyncingCloud(true);
          const { mergedShows, mergedActivity, syncedAt } = await syncWithCloudSafe(
            currentUser.id,
            showsRef.current,
            activityRef.current
          );
          setShows(mergedShows);
          setActivity(mergedActivity);
          setLastSyncedAt(syncedAt);
        } catch {
          // Ignore
        } finally {
          setIsSyncingCloud(false);
        }
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [currentUser]);

  const handleAuthSuccess = async (user: User) => {
    setCurrentUser(user);
    setIsSyncingCloud(true);
    try {
      const { mergedShows, mergedActivity, syncedAt } = await syncWithCloudSafe(
        user.id,
        showsRef.current,
        activityRef.current
      );
      setShows(mergedShows);
      setActivity(mergedActivity);
      setLastSyncedAt(syncedAt);
      initialCloudSyncDone.current = true;
      setIsAuthModalOpen(false);
      showToast(
        `Signed in & synced ${mergedShows.length} ${
          mergedShows.length === 1 ? 'show' : 'shows'
        } with your cloud account!`
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? `Signed in, but cloud sync encountered an error: ${err.message}`
          : 'Signed in!'
      );
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleManualCloudSync = async () => {
    if (!currentUser) return;
    setIsSyncingCloud(true);
    try {
      const { mergedShows, mergedActivity, syncedAt } = await syncWithCloudSafe(
        currentUser.id,
        showsRef.current,
        activityRef.current
      );
      setShows(mergedShows);
      setActivity(mergedActivity);
      setLastSyncedAt(syncedAt);
      showToast(
        `Synced ${mergedShows.length} ${
          mergedShows.length === 1 ? 'show' : 'shows'
        } across your devices!`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cloud sync failed.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const selectedShow = useMemo(
    () => shows.find((s) => s.id === selectedShowId) || null,
    [shows, selectedShowId]
  );

  // Badge counts for navigation
  const navBadges = useMemo(() => {
    const now = new Date();
    let watchNextCount = 0;
    let upcomingCount = 0;

    for (const s of shows) {
      if (
        s.manualStatus !== 'watch_later' &&
        getNextEpisodeToWatch(s, now) !== null
      ) {
        watchNextCount++;
      }
      if (getNextUpcomingEpisode(s, now) !== null) {
        upcomingCount++;
      }
    }

    return { watchNextCount, upcomingCount };
  }, [shows]);

  // Add a show by TVMaze ID
  const handleAddShow = async (showId: number, manualStatus: ManualWatchStatus = 'auto') => {
    const existing = shows.find((s) => s.id === showId);
    if (existing) {
      if (manualStatus === 'watch_later' && existing.manualStatus !== 'watch_later') {
        setShows((prev) =>
          prev.map((s) =>
            s.id === showId
              ? { ...s, manualStatus: 'watch_later', lastUpdated: Date.now() }
              : s
          )
        );
        showToast(`Moved "${existing.name}" to Watch Later`);
        return;
      }
      setSelectedShowId(existing.id);
      return;
    }

    const tracked = await fetchShowWithEpisodes(showId, undefined, manualStatus);
    setShows((prev) => [tracked, ...prev]);
    showToast(
      manualStatus === 'watch_later'
        ? `Saved "${tracked.name}" to Watch Later`
        : `Added "${tracked.name}" to your library`
    );
  };

  // Toggle a single episode watched/unwatched
  const handleToggleEpisode = (showId: number, episode: TVMazeEpisode) => {
    const targetShow = shows.find((s) => s.id === showId);
    if (!targetShow) return;

    const watchedSet = new Set(targetShow.watchedEpisodeIds);
    const wasWatched = watchedSet.has(episode.id);

    if (wasWatched) {
      watchedSet.delete(episode.id);
    } else {
      watchedSet.add(episode.id);
    }

    const nowTs = Date.now();
    setShows((prev) =>
      prev.map((s) =>
        s.id === showId
          ? {
              ...s,
              watchedEpisodeIds: Array.from(watchedSet),
              lastWatchedAt: !wasWatched ? nowTs : s.lastWatchedAt,
              lastUpdated: nowTs,
              manualStatus:
                !wasWatched && s.manualStatus === 'watch_later' ? 'auto' : s.manualStatus
            }
          : s
      )
    );

    if (!wasWatched) {
      const logItem: WatchActivityItem = {
        id: `${showId}-${episode.id}-${nowTs}`,
        showId,
        showName: targetShow.name,
        showImage: targetShow.image?.medium || null,
        episodeId: episode.id,
        episodeTitle: episode.name,
        season: episode.season,
        number: episode.number,
        timestamp: nowTs
      };
      setActivity((prev) => [logItem, ...prev.slice(0, 149)]);
      showToast(
        `Watched ${targetShow.name} ${formatEpisodeCode(episode.season, episode.number)}`
      );
    }
  };

  // Mark an episode and all prior aired episodes as watched
  const handleMarkUpToEpisode = (showId: number, targetEpisode: TVMazeEpisode) => {
    const targetShow = shows.find((s) => s.id === showId);
    if (!targetShow) return;

    const watchedSet = new Set(targetShow.watchedEpisodeIds);
    let newlyAdded = 0;

    for (const ep of targetShow.episodes) {
      const isUpTo =
        ep.season < targetEpisode.season ||
        (ep.season === targetEpisode.season &&
          (ep.number ?? 0) <= (targetEpisode.number ?? 0));
      if (isUpTo && !watchedSet.has(ep.id)) {
        watchedSet.add(ep.id);
        newlyAdded++;
      }
    }

    const nowTs = Date.now();
    setShows((prev) =>
      prev.map((s) =>
        s.id === showId
          ? {
              ...s,
              watchedEpisodeIds: Array.from(watchedSet),
              lastWatchedAt: nowTs,
              lastUpdated: nowTs,
              manualStatus: s.manualStatus === 'watch_later' ? 'auto' : s.manualStatus
            }
          : s
      )
    );

    showToast(
      `Marked up to ${formatEpisodeCode(
        targetEpisode.season,
        targetEpisode.number
      )} watched (+${newlyAdded} episodes)`
    );
  };

  // Mark or unmark an entire season
  const handleToggleSeason = (showId: number, seasonNumber: number, markWatched: boolean) => {
    const targetShow = shows.find((s) => s.id === showId);
    if (!targetShow) return;

    const watchedSet = new Set(targetShow.watchedEpisodeIds);
    const seasonEps = targetShow.episodes.filter((ep) => ep.season === seasonNumber);

    for (const ep of seasonEps) {
      if (markWatched) {
        watchedSet.add(ep.id);
      } else {
        watchedSet.delete(ep.id);
      }
    }

    const nowTs = Date.now();
    setShows((prev) =>
      prev.map((s) =>
        s.id === showId
          ? {
              ...s,
              watchedEpisodeIds: Array.from(watchedSet),
              lastWatchedAt: markWatched ? nowTs : s.lastWatchedAt,
              lastUpdated: nowTs,
              manualStatus:
                markWatched && s.manualStatus === 'watch_later' ? 'auto' : s.manualStatus
            }
          : s
      )
    );

    showToast(
      markWatched
        ? `Marked Season ${seasonNumber} of ${targetShow.name} watched`
        : `Unmarked Season ${seasonNumber} of ${targetShow.name}`
    );
  };

  // Mark all aired episodes of a show watched
  const handleMarkAllAired = (showId: number) => {
    const targetShow = shows.find((s) => s.id === showId);
    if (!targetShow) return;

    const now = new Date();
    const watchedSet = new Set(targetShow.watchedEpisodeIds);
    for (const ep of targetShow.episodes) {
      if (isEpisodeAired(ep, now)) {
        watchedSet.add(ep.id);
      }
    }

    const nowTs = Date.now();
    setShows((prev) =>
      prev.map((s) =>
        s.id === showId
          ? {
              ...s,
              watchedEpisodeIds: Array.from(watchedSet),
              lastWatchedAt: nowTs,
              lastUpdated: nowTs,
              manualStatus: 'auto'
            }
          : s
      )
    );

    showToast(`All aired episodes of ${targetShow.name} marked watched!`);
  };

  // Update metadata (rating, notes, favorite, manualStatus)
  const handleUpdateShowMeta = (
    showId: number,
    updates: Partial<Pick<TrackedShow, 'manualStatus' | 'userRating' | 'userNotes' | 'favorite'>>
  ) => {
    const targetShow = shows.find((s) => s.id === showId);
    setShows((prev) =>
      prev.map((s) =>
        s.id === showId ? { ...s, ...updates, lastUpdated: Date.now() } : s
      )
    );
    if (targetShow && updates.manualStatus) {
      showToast(
        updates.manualStatus === 'watch_later'
          ? `Moved "${targetShow.name}" to Watch Later`
          : `Moved "${targetShow.name}" out of Watch Later`
      );
    }
  };

  // One-tap toggle Watch Later status on any tracked show
  const handleToggleWatchLater = (showId: number) => {
    const targetShow = shows.find((s) => s.id === showId);
    if (!targetShow) return;
    const nextStatus: ManualWatchStatus =
      targetShow.manualStatus === 'watch_later' ? 'auto' : 'watch_later';
    handleUpdateShowMeta(showId, { manualStatus: nextStatus });
  };

  // Refresh a single show's episodes from TVMaze
  const handleRefreshShow = async (showId: number) => {
    const existing = shows.find((s) => s.id === showId);
    if (!existing) return;
    const updated = await fetchShowWithEpisodes(showId, existing, existing.manualStatus);
    setShows((prev) => prev.map((s) => (s.id === showId ? updated : s)));
    showToast(`Synced latest episode schedule for ${updated.name}`);
  };

  // Refresh all tracked shows
  const handleRefreshAll = async () => {
    if (shows.length === 0) return;
    setIsRefreshingAll(true);
    try {
      const updatedList = await Promise.all(
        shows.map(async (s) => {
          try {
            return await fetchShowWithEpisodes(s.id, s, s.manualStatus);
          } catch {
            return s;
          }
        })
      );
      setShows(updatedList);
      showToast('Synced all show schedules with TVMaze');
    } finally {
      setIsRefreshingAll(false);
    }
  };

  // Remove a show from watchlist
  const handleRemoveShow = async (showId: number) => {
    const target = shows.find((s) => s.id === showId);
    const nextShows = shows.filter((s) => s.id !== showId);
    setShows(nextShows);
    if (target) {
      showToast(`Removed "${target.name}" from your library`);
    }
    if (currentUser && !isOffline) {
      try {
        const ts = await pushCloudWatchlist(currentUser.id, nextShows, activity);
        setLastSyncedAt(ts);
      } catch {
        // Ignore
      }
    }
  };

  // Load a curated starter watchlist with realistic watched progress + currently airing shows
  const handleLoadStarterShows = async () => {
    setIsLoadingStarter(true);
    try {
      // Curated iconic TVMaze IDs:
      // 44778 = Severance, 55553 = The Last of Us, 2993 = Stranger Things, 169 = Breaking Bad
      const starterIds = [44778, 55553, 2993, 169];
      // Also grab 2 currently airing shows from today's schedule so "Upcoming" has live countdowns
      const todaySched = await fetchTodaySchedule();
      for (const item of todaySched.slice(0, 2)) {
        if (!starterIds.includes(item.show.id)) {
          starterIds.push(item.show.id);
        }
      }

      const fetched = await Promise.all(
        starterIds.map((id) => fetchShowWithEpisodes(id).catch(() => null))
      );

      const validShows = fetched.filter((s): s is TrackedShow => s !== null);
      const now = new Date();

      const configuredShows: TrackedShow[] = validShows.map((show, idx) => {
        const airedEps = show.episodes.filter((ep) => isEpisodeAired(ep, now));
        if (idx === 0 && airedEps.length > 3) {
          // Watching: mark first half of aired episodes watched so "Watch Next" has next episode ready
          const countToWatch = Math.max(1, Math.floor(airedEps.length * 0.6));
          return {
            ...show,
            watchedEpisodeIds: airedEps.slice(0, countToWatch).map((e) => e.id),
            favorite: true,
            userRating: 5,
            lastWatchedAt: Date.now() - 1000 * 60 * 45
          };
        }
        if (idx === 1 && airedEps.length > 2) {
          // Watching: mark first 3 episodes watched
          return {
            ...show,
            watchedEpisodeIds: airedEps.slice(0, 3).map((e) => e.id),
            lastWatchedAt: Date.now() - 1000 * 60 * 180
          };
        }
        if (idx === 3) {
          // Completed: mark all aired episodes watched on Breaking Bad
          return {
            ...show,
            watchedEpisodeIds: airedEps.map((e) => e.id),
            userRating: 5,
            lastWatchedAt: Date.now() - 1000 * 60 * 60 * 24
          };
        }
        // Catch up on aired episodes for today's scheduled shows so they appear in Upcoming & Watching
        return {
          ...show,
          watchedEpisodeIds: airedEps.slice(0, Math.max(0, airedEps.length - 1)).map((e) => e.id)
        };
      });

      setShows(configuredShows);
      showToast('Loaded sample watchlist with episode progress & air dates!');
    } catch {
      showToast('Could not load starter shows. Check your internet connection.');
    } finally {
      setIsLoadingStarter(false);
    }
  };

  const handleImportBackup = async (payload: WatchDatBackupPayload) => {
    setShows(payload.shows);
    if (Array.isArray(payload.activity)) {
      setActivity(payload.activity);
    }
    showToast(`Restored ${payload.shows.length} shows from backup!`);
  };

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-[#0b0c10] text-zinc-100 pb-24 sm:pb-12 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#0b0c10]/90 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div
            onClick={() => setActivePage('shows')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-zinc-950 shadow-md shadow-amber-400/15 group-hover:scale-105 transition">
              <Tv className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="font-black text-lg tracking-tight text-white leading-none flex items-center gap-1.5">
                Watch<span className="text-amber-400">Dat</span>
                <span className="hidden md:inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  PWA
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 font-medium hidden sm:block">
                TV Show Tracker &amp; Air Dates
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden sm:flex items-center gap-1 bg-zinc-900/90 border border-zinc-800/90 p-1 rounded-2xl">
            <button
              onClick={() => setActivePage('shows')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                activePage === 'shows'
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>Shows</span>
              {navBadges.watchNextCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    activePage === 'shows'
                      ? 'bg-zinc-950/20 text-zinc-950'
                      : 'bg-amber-400/20 text-amber-300'
                  }`}
                >
                  {navBadges.watchNextCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActivePage('upcoming')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                activePage === 'upcoming'
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Upcoming</span>
              {navBadges.upcomingCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    activePage === 'upcoming'
                      ? 'bg-zinc-950/20 text-zinc-950'
                      : 'bg-sky-400/20 text-sky-300'
                  }`}
                >
                  {navBadges.upcomingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActivePage('discover')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                activePage === 'discover'
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Discover</span>
            </button>

            <button
              onClick={() => setActivePage('profile')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                activePage === 'profile'
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Profile &amp; Stats</span>
            </button>
          </nav>

          {/* Right Quick Actions */}
          <div className="flex items-center gap-2">
            {isOffline && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <WifiOff className="w-3.5 h-3.5" />
                Offline Mode
              </span>
            )}

            <button
              onClick={() => setIsAuthModalOpen(true)}
              title={
                currentUser
                  ? `Signed in as ${currentUser.email}`
                  : 'Sign In to sync shows across Android & Web'
              }
              className={`px-3 py-2 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                currentUser
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300'
                  : 'bg-zinc-800/90 hover:bg-zinc-800 border-zinc-700 text-zinc-200 hover:text-amber-300'
              }`}
            >
              <Cloud
                className={`w-3.5 h-3.5 ${
                  isSyncingCloud
                    ? 'animate-pulse text-amber-400'
                    : currentUser
                    ? 'text-emerald-400'
                    : 'text-sky-400'
                }`}
              />
              <span className="hidden md:inline">
                {currentUser ? 'Cloud Synced' : 'Sign In'}
              </span>
            </button>

            {deferredPrompt && (
              <button
                onClick={handleInstallPwa}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 text-xs font-bold transition cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Install App
              </button>
            )}

            <button
              onClick={() => setIsTVTimeImportOpen(true)}
              title="Import your TV Time history (.zip, .csv, .json)"
              className="px-3 py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileArchive className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Import TV Time</span>
            </button>

            {activePage !== 'discover' && (
              <button
                onClick={() => setActivePage('discover')}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Show</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pt-6">
        {activePage === 'shows' && (
          <WatchlistView
            shows={shows}
            onSelectShow={(s) => setSelectedShowId(s.id)}
            onToggleEpisode={handleToggleEpisode}
            onToggleWatchLater={handleToggleWatchLater}
            onGoToDiscover={() => setActivePage('discover')}
            onLoadStarterShows={handleLoadStarterShows}
            isLoadingStarter={isLoadingStarter}
            onOpenTVTimeImport={() => setIsTVTimeImportOpen(true)}
          />
        )}

        {activePage === 'upcoming' && (
          <UpcomingView
            shows={shows}
            onSelectShow={(s) => setSelectedShowId(s.id)}
            onRefreshAll={handleRefreshAll}
            isRefreshingAll={isRefreshingAll}
            onGoToDiscover={() => setActivePage('discover')}
          />
        )}

        {activePage === 'discover' && (
          <DiscoverView
            trackedShows={shows}
            onAddShow={handleAddShow}
            onToggleWatchLater={handleToggleWatchLater}
            onSelectTrackedShow={(s) => setSelectedShowId(s.id)}
          />
        )}

        {activePage === 'profile' && (
          <StatsProfileView
            shows={shows}
            activity={activity}
            onSelectShow={(s) => setSelectedShowId(s.id)}
            onImportBackup={handleImportBackup}
            onRefreshAll={handleRefreshAll}
            isRefreshingAll={isRefreshingAll}
            canInstallPwa={Boolean(deferredPrompt)}
            onInstallPwa={handleInstallPwa}
            onOpenTVTimeImport={() => setIsTVTimeImportOpen(true)}
            userEmail={currentUser?.email || null}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (TV Time App Style) */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0e1017]/95 backdrop-blur-lg border-t border-zinc-800/90 px-2 py-1.5 flex items-center justify-around">
        <button
          onClick={() => setActivePage('shows')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[11px] font-bold transition ${
            activePage === 'shows' ? 'text-amber-400' : 'text-zinc-500'
          }`}
        >
          <div className="relative">
            <Tv className="w-5 h-5" />
            {navBadges.watchNextCount > 0 && (
              <span className="absolute -top-1 -right-2.5 px-1 min-w-[16px] h-4 rounded-full bg-amber-400 text-zinc-950 text-[10px] font-extrabold flex items-center justify-center">
                {navBadges.watchNextCount}
              </span>
            )}
          </div>
          <span>Shows</span>
        </button>

        <button
          onClick={() => setActivePage('upcoming')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[11px] font-bold transition ${
            activePage === 'upcoming' ? 'text-amber-400' : 'text-zinc-500'
          }`}
        >
          <div className="relative">
            <Calendar className="w-5 h-5" />
            {navBadges.upcomingCount > 0 && (
              <span className="absolute -top-1 -right-2.5 px-1 min-w-[16px] h-4 rounded-full bg-sky-400 text-zinc-950 text-[10px] font-extrabold flex items-center justify-center">
                {navBadges.upcomingCount}
              </span>
            )}
          </div>
          <span>Upcoming</span>
        </button>

        <button
          onClick={() => setActivePage('discover')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[11px] font-bold transition ${
            activePage === 'discover' ? 'text-amber-400' : 'text-zinc-500'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span>Discover</span>
        </button>

        <button
          onClick={() => setActivePage('profile')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl text-[11px] font-bold transition ${
            activePage === 'profile' ? 'text-amber-400' : 'text-zinc-500'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span>Profile</span>
        </button>
      </nav>

      {/* Show Details & Episode Check-off Modal */}
      {selectedShow && (
        <ShowDetailModal
          show={selectedShow}
          onClose={() => setSelectedShowId(null)}
          onToggleEpisode={handleToggleEpisode}
          onMarkUpToEpisode={handleMarkUpToEpisode}
          onToggleSeason={handleToggleSeason}
          onMarkAllAired={handleMarkAllAired}
          onUpdateShowMeta={handleUpdateShowMeta}
          onRefreshShow={handleRefreshShow}
          onRemoveShow={handleRemoveShow}
        />
      )}

      {/* TV Time History Importer Modal */}
      {isTVTimeImportOpen && (
        <TVTimeImportModal
          existingShows={shows}
          existingActivity={activity}
          onClose={() => setIsTVTimeImportOpen(false)}
          onImportComplete={(mergedShows, mergedActivity, importedCount) => {
            setShows(mergedShows);
            setActivity(mergedActivity);
            setIsTVTimeImportOpen(false);
            setActivePage('shows');
            showToast(`Successfully imported ${importedCount} shows from TV Time!`);
          }}
        />
      )}

      {/* Cloud Login & Sync Modal */}
      {isAuthModalOpen && (
        <AuthModal
          user={currentUser}
          lastSyncedAt={lastSyncedAt}
          isSyncing={isSyncingCloud}
          onClose={() => setIsAuthModalOpen(false)}
          onAuthSuccess={handleAuthSuccess}
          onSignOutSuccess={() => {
            setCurrentUser(null);
            setLastSyncedAt(null);
            setIsAuthModalOpen(false);
            showToast('Signed out of cloud account (your local shows are still saved).');
          }}
          onManualSync={handleManualCloudSync}
        />
      )}

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto z-50 flex justify-center sm:justify-end pointer-events-none">
          <div className="bg-zinc-900/95 border border-amber-400/40 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-semibold pointer-events-auto">
            <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
