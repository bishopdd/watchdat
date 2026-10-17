import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Check,
  Bookmark,
  Star,
  Tv,
  Sparkles,
  Calendar,
  Loader2,
  X
} from 'lucide-react';
import { TVMazeRawShow, TVMazeEpisode, TrackedShow, ManualWatchStatus } from '../types/tv';
import {
  searchShows,
  fetchTodaySchedule,
  fetchPopularShows,
  stripHtml,
  formatEpisodeCode
} from '../services/tvmaze';

interface DiscoverViewProps {
  trackedShows: TrackedShow[];
  onAddShow: (showId: number, manualStatus?: ManualWatchStatus) => Promise<void>;
  onToggleWatchLater: (showId: number) => void;
  onSelectTrackedShow: (show: TrackedShow) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  trackedShows,
  onAddShow,
  onToggleWatchLater,
  onSelectTrackedShow
}) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TVMazeRawShow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState<
    Array<{ show: TVMazeRawShow; episode: TVMazeEpisode }>
  >([]);
  const [popularShows, setPopularShows] = useState<TVMazeRawShow[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [addingIds, setAddingIds] = useState<Record<number, boolean>>({});
  const [selectedGenre, setSelectedGenre] = useState<string>('All');

  const trackedMap = useMemo(() => {
    const map = new Map<number, TrackedShow>();
    for (const s of trackedShows) {
      map.set(s.id, s);
    }
    return map;
  }, [trackedShows]);

  // Load today's schedule & popular shows on mount
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      setIsLoadingInitial(true);
      try {
        const [sched, pop] = await Promise.all([
          fetchTodaySchedule(),
          fetchPopularShows()
        ]);
        if (!cancelled) {
          setTodaySchedule(sched);
          setPopularShows(pop);
        }
      } catch {
        // Ignore offline errors gracefully
      } finally {
        if (!cancelled) setIsLoadingInitial(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchShows(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [query]);

  const handleTrackClick = async (
    showId: number,
    manualStatus: ManualWatchStatus = 'auto'
  ) => {
    const existing = trackedMap.get(showId);
    if (existing) {
      onSelectTrackedShow(existing);
      return;
    }

    setAddingIds((prev) => ({ ...prev, [showId]: true }));
    try {
      await onAddShow(showId, manualStatus);
    } finally {
      setAddingIds((prev) => ({ ...prev, [showId]: false }));
    }
  };

  const genres = useMemo(() => {
    const gSet = new Set<string>(['All']);
    for (const s of popularShows) {
      for (const g of s.genres || []) {
        gSet.add(g);
      }
    }
    return Array.from(gSet).slice(0, 10);
  }, [popularShows]);

  const filteredPopular = useMemo(() => {
    if (selectedGenre === 'All') return popularShows;
    return popularShows.filter((s) => s.genres?.includes(selectedGenre));
  }, [popularShows, selectedGenre]);

  const renderShowCard = (raw: TVMazeRawShow, badgeText?: string) => {
    const tracked = trackedMap.get(raw.id);
    const isAdding = Boolean(addingIds[raw.id]);
    const network = raw.network?.name || raw.webChannel?.name;

    return (
      <div
        key={raw.id}
        className="group bg-[#141722] hover:bg-[#191d2b] border border-zinc-800/90 hover:border-zinc-700 rounded-2xl overflow-hidden flex flex-col justify-between shadow-md transition"
      >
        <div>
          {/* Poster */}
          <div
            onClick={() => (tracked ? onSelectTrackedShow(tracked) : handleTrackClick(raw.id))}
            className="relative aspect-[2/3] w-full bg-zinc-900 overflow-hidden cursor-pointer"
          >
            {raw.image?.medium ? (
              <img
                src={raw.image.medium}
                alt={raw.name}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-700">
                <Tv className="w-10 h-10" />
              </div>
            )}

            <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1">
              {badgeText ? (
                <span className="px-2 py-0.5 rounded-lg bg-sky-500/90 text-zinc-950 font-extrabold text-[10px] shadow">
                  {badgeText}
                </span>
              ) : (
                <span
                  className={`px-2 py-0.5 rounded-lg backdrop-blur-md font-bold text-[10px] ${
                    raw.status === 'Running'
                      ? 'bg-emerald-500/85 text-zinc-950'
                      : 'bg-black/75 text-zinc-300'
                  }`}
                >
                  {raw.status}
                </span>
              )}

              {raw.rating?.average && (
                <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-black/80 text-amber-400 font-bold text-[10px]">
                  <Star className="w-2.5 h-2.5 fill-amber-400" />
                  {raw.rating.average.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="p-3">
            <h3 className="font-bold text-xs sm:text-sm text-white truncate">{raw.name}</h3>
            <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
              {network || 'TV Series'}
              {raw.premiered ? ` • ${raw.premiered.slice(0, 4)}` : ''}
            </div>
            {raw.summary && (
              <p className="text-[11px] text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">
                {stripHtml(raw.summary)}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-3 pt-0 flex flex-col gap-1.5">
          {tracked ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onSelectTrackedShow(tracked)}
                className="flex-1 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                Tracked
              </button>
              <button
                onClick={() => onToggleWatchLater(tracked.id)}
                title={
                  tracked.manualStatus === 'watch_later'
                    ? 'Remove from Watch Later'
                    : 'Move to Watch Later'
                }
                className={`px-2.5 py-2 rounded-xl border font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer ${
                  tracked.manualStatus === 'watch_later'
                    ? 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/40 text-purple-300'
                    : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 hover:text-purple-300'
                }`}
              >
                <Bookmark
                  className={`w-3.5 h-3.5 ${
                    tracked.manualStatus === 'watch_later' ? 'fill-purple-400 text-purple-400' : ''
                  }`}
                />
                <span>Watch Later</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleTrackClick(raw.id, 'auto')}
                disabled={isAdding}
                className="flex-1 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1 shadow transition disabled:opacity-50 cursor-pointer"
              >
                {isAdding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
                Track
              </button>
              <button
                onClick={() => handleTrackClick(raw.id, 'watch_later')}
                disabled={isAdding}
                title="Save to Watch Later"
                className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 hover:text-purple-300 font-bold text-xs flex items-center justify-center gap-1 transition disabled:opacity-50 cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5 text-purple-400" />
                <span>Watch Later</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-7">
      {/* Search Banner */}
      <div className="bg-gradient-to-b from-[#161926] to-[#12141c] border border-zinc-800/90 rounded-2xl p-5 sm:p-6 shadow-lg">
        <h1 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          Discover &amp; Track TV Shows
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Search any TV series to track watched episodes and get automatic countdowns for future
          air dates
        </p>

        <div className="relative mt-4">
          <Search className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search TV shows (e.g. Severance, The Bear, Stranger Things, House of the Dragon)..."
            className="w-full bg-zinc-950/90 border border-zinc-700/80 focus:border-amber-400 rounded-2xl pl-12 pr-10 py-3.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none shadow-inner"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search Results */}
      {query.trim() !== '' ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-white">
              Search Results for &ldquo;{query}&rdquo;
            </h2>
            {isSearching && (
              <span className="flex items-center gap-1.5 text-xs text-amber-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching TVMaze...
              </span>
            )}
          </div>

          {!isSearching && searchResults.length === 0 ? (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-8 text-center text-sm text-zinc-400">
              No TV shows found matching &ldquo;{query}&rdquo;. Try another title!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {searchResults.map((show) => renderShowCard(show))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Airing Today on TV */}
          {todaySchedule.length > 0 && (
            <section className="space-y-3.5">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-400" />
                  Airing Today on TV
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Series broadcasting new episodes today
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {todaySchedule.slice(0, 6).map(({ show, episode }) =>
                  renderShowCard(
                    show,
                    `Today • ${formatEpisodeCode(episode.season, episode.number)}`
                  )
                )}
              </div>
            </section>
          )}

          {/* Acclaimed & Popular Shows */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  Acclaimed &amp; Popular Series
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  One tap to add any show to your WatchDat tracker
                </p>
              </div>

              {/* Genre Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {genres.map((g) => (
                  <button
                    key={g}
                    onClick={() => setSelectedGenre(g)}
                    className={`flex-shrink-0 px-3 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      selectedGenre === g
                        ? 'bg-amber-400 text-zinc-950 border-amber-400 font-bold'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {isLoadingInitial ? (
              <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
                <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                <span className="text-xs">Loading popular TV shows...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredPopular.map((show) => renderShowCard(show))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
