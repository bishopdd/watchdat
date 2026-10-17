import React, { useState, useMemo } from 'react';
import {
  Check,
  Play,
  Calendar,
  Tv,
  Search,
  Plus,
  Sparkles,
  CheckCircle2,
  Bookmark,
  Star,
  Heart,
  ArrowUpDown,
  ChevronRight,
  FileArchive
} from 'lucide-react';
import { TrackedShow, TVMazeEpisode, WatchlistTab } from '../types/tv';
import {
  getComputedWatchTab,
  getNextEpisodeToWatch,
  getNextUpcomingEpisode,
  getShowProgress,
  formatEpisodeCode,
  formatAirDateCountdown
} from '../services/tvmaze';

interface WatchlistViewProps {
  shows: TrackedShow[];
  onSelectShow: (show: TrackedShow) => void;
  onToggleEpisode: (showId: number, episode: TVMazeEpisode) => void;
  onGoToDiscover: () => void;
  onLoadStarterShows: () => Promise<void>;
  isLoadingStarter: boolean;
  onOpenTVTimeImport: () => void;
}

type SortOption = 'recent' | 'progress' | 'alphabetical' | 'remaining';

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  shows,
  onSelectShow,
  onToggleEpisode,
  onGoToDiscover,
  onLoadStarterShows,
  isLoadingStarter,
  onOpenTVTimeImport
}) => {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('watching');
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [justCheckedIds, setJustCheckedIds] = useState<Record<number, boolean>>({});

  const now = useMemo(() => new Date(), [shows]);

  // Compute counts for each tab
  const tabCounts = useMemo(() => {
    const counts: Record<WatchlistTab, number> = {
      watching: 0,
      upcoming: 0,
      watch_later: 0,
      completed: 0,
      all: shows.length
    };
    for (const show of shows) {
      const cat = getComputedWatchTab(show, now);
      counts[cat]++;
    }
    return counts;
  }, [shows, now]);

  // Watch Next Queue: all shows that currently have an unwatched aired episode
  // (excluding shows explicitly parked in Watch Later with 0 watched episodes)
  const watchNextQueue = useMemo(() => {
    return shows
      .filter((show) => {
        if (show.manualStatus === 'watch_later' && show.watchedEpisodeIds.length === 0) {
          return false;
        }
        return getNextEpisodeToWatch(show, now) !== null;
      })
      .map((show) => ({
        show,
        nextEp: getNextEpisodeToWatch(show, now)!,
        progress: getShowProgress(show, now)
      }))
      .sort((a, b) => {
        const aTime = a.show.lastWatchedAt || a.show.addedAt;
        const bTime = b.show.lastWatchedAt || b.show.addedAt;
        return bTime - aTime;
      });
  }, [shows, now]);

  // Filtered & sorted shows for the active tab
  const filteredShows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const list = shows.filter((show) => {
      if (q && !show.name.toLowerCase().includes(q)) return false;
      if (activeTab === 'all') return true;
      return getComputedWatchTab(show, now) === activeTab;
    });

    return list.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;

      if (sortBy === 'alphabetical') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'progress') {
        return getShowProgress(b, now).percentAired - getShowProgress(a, now).percentAired;
      }
      if (sortBy === 'remaining') {
        return (
          getShowProgress(a, now).remainingToWatch - getShowProgress(b, now).remainingToWatch
        );
      }
      // 'recent'
      const aTime = a.lastWatchedAt || a.addedAt;
      const bTime = b.lastWatchedAt || b.addedAt;
      return bTime - aTime;
    });
  }, [shows, activeTab, filterText, sortBy, now]);

  const handleQuickMarkWatched = (
    e: React.MouseEvent,
    showId: number,
    episode: TVMazeEpisode
  ) => {
    e.stopPropagation();
    setJustCheckedIds((prev) => ({ ...prev, [showId]: true }));
    setTimeout(() => {
      onToggleEpisode(showId, episode);
      setJustCheckedIds((prev) => ({ ...prev, [showId]: false }));
    }, 180);
  };

  if (shows.length === 0) {
    return (
      <div className="max-w-2xl mx-auto my-8 sm:my-14 px-4">
        <div className="bg-gradient-to-b from-zinc-900/90 to-[#12141c] border border-zinc-800/90 rounded-3xl p-7 sm:p-10 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center mx-auto mb-5 text-amber-400 shadow-inner">
            <Tv className="w-8 h-8" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Welcome to WatchDat
          </h2>
          <p className="mt-2.5 text-sm sm:text-base text-zinc-400 max-w-md mx-auto leading-relaxed">
            Your personal TV Time-style companion. Import your existing TV Time history, track
            episodes you&apos;ve watched, and get live countdowns for upcoming air dates.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
            <button
              onClick={onOpenTVTimeImport}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition cursor-pointer"
            >
              <FileArchive className="w-4 h-4 stroke-[2.25]" />
              Import TV Time History
            </button>
            <button
              onClick={onGoToDiscover}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5] text-amber-400" />
              Search &amp; Add Shows
            </button>
            <button
              onClick={onLoadStarterShows}
              disabled={isLoadingStarter}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              {isLoadingStarter ? 'Loading Starter Shows...' : 'Load Sample Watchlist'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: WatchlistTab; label: string; icon: React.ReactNode }> = [
    { id: 'watching', label: 'Watching', icon: <Play className="w-3.5 h-3.5" /> },
    { id: 'upcoming', label: 'Upcoming', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'watch_later', label: 'Watch Later', icon: <Bookmark className="w-3.5 h-3.5" /> },
    { id: 'completed', label: 'Completed', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { id: 'all', label: 'All Shows', icon: <Tv className="w-3.5 h-3.5" /> }
  ];

  return (
    <div className="space-y-7">
      {/* TV Time Style "Watch Next" Deck (Always prominent at the top when on Watching tab or when queue has items) */}
      {watchNextQueue.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                <span className="w-2 h-5 rounded-full bg-amber-400 inline-block" />
                Watch Next Queue
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  {watchNextQueue.length} {watchNextQueue.length === 1 ? 'show' : 'shows'}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Tap the checkmark as soon as you finish an episode to advance your queue
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {watchNextQueue.map(({ show, nextEp, progress }) => {
              const isJustChecked = Boolean(justCheckedIds[show.id]);

              return (
                <div
                  key={show.id}
                  onClick={() => onSelectShow(show)}
                  className={`group relative bg-[#141722] hover:bg-[#181c29] border border-zinc-800/90 hover:border-amber-400/40 rounded-2xl overflow-hidden shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    isJustChecked ? 'scale-[0.98] opacity-60' : ''
                  }`}
                >
                  <div className="p-3.5 flex gap-3.5 items-center">
                    {/* Poster Thumbnail */}
                    <div className="relative w-16 h-24 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 border border-zinc-700/60 shadow">
                      {show.image?.medium ? (
                        <img
                          src={show.image.medium}
                          alt={show.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Tv className="w-6 h-6" />
                        </div>
                      )}
                      {progress.remainingToWatch > 1 && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/85 text-amber-300 font-bold text-[10px] border border-amber-400/30">
                          +{progress.remainingToWatch - 1}
                        </span>
                      )}
                    </div>

                    {/* Episode Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-400 truncate">
                          {show.name}
                        </span>
                        {show.favorite && (
                          <Heart className="w-3 h-3 fill-rose-400 text-rose-400 flex-shrink-0" />
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 font-mono font-bold text-xs">
                          {formatEpisodeCode(nextEp.season, nextEp.number)}
                        </span>
                        {nextEp.number === 1 && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase">
                            Premiere
                          </span>
                        )}
                      </div>

                      <h3 className="mt-1.5 text-sm font-bold text-white truncate group-hover:text-amber-200 transition">
                        {nextEp.name}
                      </h3>

                      <div className="mt-1 text-[11px] text-zinc-400 flex items-center gap-2">
                        <span>
                          {progress.watchedCount}/{progress.airedEpisodes} watched
                        </span>
                        <span>•</span>
                        <span className="text-amber-400/90 font-medium">
                          {progress.remainingToWatch} left
                        </span>
                      </div>
                    </div>

                    {/* TV Time Checkmark Button */}
                    <button
                      onClick={(e) => handleQuickMarkWatched(e, show.id, nextEp)}
                      title={`Mark ${formatEpisodeCode(nextEp.season, nextEp.number)} as watched`}
                      className="w-12 h-12 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-90 text-zinc-950 flex flex-col items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/10 transition cursor-pointer"
                    >
                      <Check className="w-6 h-6 stroke-[2.75]" />
                    </button>
                  </div>

                  {/* Bottom Progress Strip */}
                  <div className="w-full h-1.5 bg-zinc-900">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-500"
                      style={{ width: `${progress.percentAired}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Watchlist Tabs & Controls */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const count = tabCounts[tab.id];
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    isActive
                      ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-sm'
                      : 'bg-zinc-900/90 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-white'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                      isActive
                        ? 'bg-zinc-950/20 text-zinc-950 font-extrabold'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filter & Sort Controls */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter my shows..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="relative flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl pl-7 pr-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
              >
                <option value="recent">Sort: Recent</option>
                <option value="remaining">Sort: Episodes Left</option>
                <option value="progress">Sort: Progress %</option>
                <option value="alphabetical">Sort: A–Z</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab Description Context */}
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <span>
            {activeTab === 'watching' &&
              'Shows with aired episodes ready for you to watch right now.'}
            {activeTab === 'upcoming' &&
              'Shows you are 100% caught up on that are still running or have upcoming episodes.'}
            {activeTab === 'watch_later' &&
              'Shows bookmarked to start watching when you have time.'}
            {activeTab === 'completed' &&
              'Ended shows where you have watched every single episode.'}
            {activeTab === 'all' && 'All TV shows in your personal library.'}
          </span>
        </div>

        {/* Shows Grid */}
        {filteredShows.length === 0 ? (
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold text-zinc-300">
              No shows in &ldquo;{tabs.find((t) => t.id === activeTab)?.label}&rdquo;
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {activeTab === 'watching'
                ? 'You are all caught up on your active shows! Check Upcoming for next air dates or discover a new series.'
                : 'Try switching tabs or adding more shows from Discover.'}
            </p>
            <button
              onClick={onGoToDiscover}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-bold transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Discover Shows
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredShows.map((show) => {
              const progress = getShowProgress(show, now);
              const nextToWatch = getNextEpisodeToWatch(show, now);
              const nextUpcoming = getNextUpcomingEpisode(show, now);
              const countdown = nextUpcoming
                ? formatAirDateCountdown(nextUpcoming, now)
                : null;

              return (
                <div
                  key={show.id}
                  onClick={() => onSelectShow(show)}
                  className="group bg-[#141722] hover:bg-[#191d2b] border border-zinc-800/80 hover:border-zinc-700 rounded-2xl overflow-hidden shadow-md transition-all duration-200 flex flex-col cursor-pointer"
                >
                  {/* Poster */}
                  <div className="relative aspect-[2/3] w-full bg-zinc-900 overflow-hidden">
                    {show.image?.medium ? (
                      <img
                        src={show.image.medium}
                        alt={show.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700">
                        <Tv className="w-10 h-10" />
                      </div>
                    )}

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1">
                      {countdown ? (
                        <span className="px-2 py-0.5 rounded-lg bg-sky-500/90 backdrop-blur-md text-zinc-950 font-extrabold text-[10px] shadow">
                          {countdown.badge}
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-lg backdrop-blur-md font-bold text-[10px] ${
                            show.status === 'Running'
                              ? 'bg-emerald-500/85 text-zinc-950'
                              : 'bg-black/75 text-zinc-300'
                          }`}
                        >
                          {show.status}
                        </span>
                      )}

                      {progress.remainingToWatch > 0 && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-400 text-zinc-950 font-extrabold text-[10px] shadow">
                          {progress.remainingToWatch} left
                        </span>
                      )}
                    </div>

                    {/* Gradient overlay at bottom of poster */}
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#141722] via-[#141722]/60 to-transparent" />

                    {/* Progress bar overlaid on bottom of poster */}
                    <div className="absolute bottom-2 inset-x-2.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-zinc-200 mb-1">
                        <span>
                          {progress.watchedCount}/{progress.airedEpisodes} ep
                        </span>
                        <span className="text-amber-400">{progress.percentAired}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800/90 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            progress.percentAired === 100
                              ? 'bg-emerald-400'
                              : 'bg-amber-400'
                          }`}
                          style={{ width: `${progress.percentAired}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="font-bold text-xs sm:text-sm text-white truncate group-hover:text-amber-300 transition">
                          {show.name}
                        </h3>
                        {show.userRating && (
                          <span className="flex items-center gap-0.5 text-[11px] font-bold text-amber-400 flex-shrink-0">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {show.userRating}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-[11px] text-zinc-400 truncate">
                        {nextToWatch ? (
                          <span className="text-amber-300/90 font-medium">
                            Next: {formatEpisodeCode(nextToWatch.season, nextToWatch.number)}{' '}
                            {nextToWatch.name}
                          </span>
                        ) : nextUpcoming ? (
                          <span className="text-sky-300/90">
                            Airs {countdown?.exactDateStr}:{' '}
                            {formatEpisodeCode(nextUpcoming.season, nextUpcoming.number)}
                          </span>
                        ) : show.status === 'Running' ? (
                          <span className="text-emerald-400/80">Caught up • Next TBA</span>
                        ) : (
                          <span className="text-zinc-500">All episodes watched</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-zinc-800/70 flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="truncate">{show.networkName || 'TV Series'}</span>
                      <span className="flex items-center text-zinc-400 group-hover:text-amber-400 font-semibold">
                        Episodes <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
