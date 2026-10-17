import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  CheckCheck,
  Calendar,
  Clock,
  Star,
  Tv,
  Trash2,
  RefreshCw,
  Bookmark,
  Play,
  Heart,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { TrackedShow, TVMazeEpisode, ManualWatchStatus } from '../types/tv';
import {
  formatEpisodeCode,
  stripHtml,
  isEpisodeAired,
  getNextEpisodeToWatch,
  getNextUpcomingEpisode,
  getShowProgress,
  formatAirDateCountdown,
  getEpisodeAirDate
} from '../services/tvmaze';

interface ShowDetailModalProps {
  show: TrackedShow;
  onClose: () => void;
  onToggleEpisode: (showId: number, episode: TVMazeEpisode) => void;
  onMarkUpToEpisode: (showId: number, episode: TVMazeEpisode) => void;
  onToggleSeason: (showId: number, seasonNumber: number, markWatched: boolean) => void;
  onMarkAllAired: (showId: number) => void;
  onUpdateShowMeta: (
    showId: number,
    updates: Partial<Pick<TrackedShow, 'manualStatus' | 'userRating' | 'userNotes' | 'favorite'>>
  ) => void;
  onRefreshShow: (showId: number) => Promise<void>;
  onRemoveShow: (showId: number) => void;
}

export const ShowDetailModal: React.FC<ShowDetailModalProps> = ({
  show,
  onClose,
  onToggleEpisode,
  onMarkUpToEpisode,
  onToggleSeason,
  onMarkAllAired,
  onUpdateShowMeta,
  onRefreshShow,
  onRemoveShow
}) => {
  const now = useMemo(() => new Date(), []);
  const progress = useMemo(() => getShowProgress(show, now), [show, now]);
  const nextToWatch = useMemo(() => getNextEpisodeToWatch(show, now), [show, now]);
  const nextUpcoming = useMemo(() => getNextUpcomingEpisode(show, now), [show, now]);
  const upcomingCountdown = useMemo(
    () => (nextUpcoming ? formatAirDateCountdown(nextUpcoming, now) : null),
    [nextUpcoming, now]
  );

  // Extract unique season numbers
  const seasons = useMemo(() => {
    const sSet = new Set<number>();
    for (const ep of show.episodes) {
      if (ep.season != null) sSet.add(ep.season);
    }
    return Array.from(sSet).sort((a, b) => a - b);
  }, [show.episodes]);

  // Default selected season: the season of nextToWatch, or nextUpcoming, or season 1
  const initialSeason = useMemo(() => {
    if (nextToWatch) return nextToWatch.season;
    if (nextUpcoming) return nextUpcoming.season;
    return seasons[seasons.length - 1] ?? 1;
  }, [nextToWatch, nextUpcoming, seasons]);

  const [selectedSeason, setSelectedSeason] = useState<number>(initialSeason);
  const [expandedEpId, setExpandedEpId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previousPromptEp, setPreviousPromptEp] = useState<TVMazeEpisode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const watchedSet = useMemo(() => new Set(show.watchedEpisodeIds), [show.watchedEpisodeIds]);

  const seasonEpisodes = useMemo(
    () => show.episodes.filter((ep) => ep.season === selectedSeason),
    [show.episodes, selectedSeason]
  );

  const seasonStats = useMemo(() => {
    const total = seasonEpisodes.length;
    const aired = seasonEpisodes.filter((ep) => isEpisodeAired(ep, now));
    const watched = seasonEpisodes.filter((ep) => watchedSet.has(ep.id)).length;
    const allSeasonWatched = total > 0 && watched === total;
    const allAiredSeasonWatched =
      aired.length > 0 && aired.every((ep) => watchedSet.has(ep.id));
    return { total, airedCount: aired.length, watched, allSeasonWatched, allAiredSeasonWatched };
  }, [seasonEpisodes, watchedSet, now]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshShow(show.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEpisodeCheckClick = (ep: TVMazeEpisode) => {
    const isCurrentlyWatched = watchedSet.has(ep.id);
    if (!isCurrentlyWatched) {
      // Check if there are earlier unwatched aired episodes before this one
      const earlierUnwatched = show.episodes.filter((other) => {
        const isBefore =
          other.season < ep.season ||
          (other.season === ep.season && (other.number ?? 0) < (ep.number ?? 0));
        return isBefore && !watchedSet.has(other.id) && isEpisodeAired(other, now);
      });
      if (earlierUnwatched.length > 0) {
        setPreviousPromptEp(ep);
      }
    } else {
      if (previousPromptEp?.id === ep.id) {
        setPreviousPromptEp(null);
      }
    }
    onToggleEpisode(show.id, ep);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] bg-[#12141c] border border-zinc-800/90 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Hero Banner */}
        <div className="relative flex-shrink-0 bg-gradient-to-b from-zinc-900 to-[#12141c] p-5 sm:p-6 border-b border-zinc-800/80">
          {show.image?.original && (
            <div
              className="absolute inset-0 opacity-15 bg-cover bg-center pointer-events-none blur-md"
              style={{ backgroundImage: `url(${show.image.original})` }}
            />
          )}

          {/* Top Bar Controls */}
          <div className="relative z-10 flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase ${
                  show.status === 'Running'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : show.status === 'Ended'
                    ? 'bg-zinc-700/60 text-zinc-300 border border-zinc-600/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {show.status}
              </span>
              {show.networkName && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800/90 text-zinc-300 border border-zinc-700/60">
                  {show.networkName}
                </span>
              )}
              {show.rating && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {show.rating.toFixed(1)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateShowMeta(show.id, {
                    manualStatus: show.manualStatus === 'watch_later' ? 'auto' : 'watch_later'
                  })
                }
                title={
                  show.manualStatus === 'watch_later'
                    ? 'Remove from Watch Later (return to active list)'
                    : 'Move to Watch Later'
                }
                className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  show.manualStatus === 'watch_later'
                    ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-sm'
                    : 'bg-zinc-800/90 border-zinc-700/70 text-zinc-200 hover:border-amber-400/60 hover:text-amber-300'
                }`}
              >
                <Bookmark
                  className={`w-3.5 h-3.5 ${
                    show.manualStatus === 'watch_later' ? 'fill-zinc-950' : ''
                  }`}
                />
                <span>
                  {show.manualStatus === 'watch_later' ? 'In Watch Later' : 'Watch Later'}
                </span>
              </button>

              <button
                onClick={() => onUpdateShowMeta(show.id, { favorite: !show.favorite })}
                title={show.favorite ? 'Remove from favorites' : 'Mark as favorite'}
                className={`p-2 rounded-full border transition cursor-pointer ${
                  show.favorite
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Heart className={`w-4 h-4 ${show.favorite ? 'fill-rose-400' : ''}`} />
              </button>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh episode air dates from TVMaze"
                className="p-2 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-700 transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 hover:text-white hover:bg-zinc-700 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Poster + Metadata */}
          <div className="relative z-10 flex gap-4 sm:gap-5">
            <div className="w-24 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 shadow-lg border border-zinc-700/60">
              {show.image?.medium ? (
                <img
                  src={show.image.medium}
                  alt={show.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  <Tv className="w-8 h-8" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight truncate">
                {show.name}
              </h2>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-zinc-400">
                {show.premiered && <span>Premiered {show.premiered.slice(0, 4)}</span>}
                {show.averageRuntime > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    ~{show.averageRuntime}m / ep
                  </span>
                )}
                {show.schedule.days.length > 0 && (
                  <span className="flex items-center gap-1 text-zinc-300">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    {show.schedule.days.join(', ')}
                    {show.schedule.time ? ` at ${show.schedule.time}` : ''}
                  </span>
                )}
              </div>

              {show.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {show.genres.map((g) => (
                    <span
                      key={g}
                      className="px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-300 text-[11px] font-medium"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {show.summary && (
                <p className="mt-2.5 text-xs sm:text-sm text-zinc-300 line-clamp-2 leading-relaxed">
                  {stripHtml(show.summary)}
                </p>
              )}

              {/* Watch Later Button & Personal Rating Controls */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateShowMeta(show.id, {
                      manualStatus: show.manualStatus === 'watch_later' ? 'auto' : 'watch_later'
                    })
                  }
                  className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    show.manualStatus === 'watch_later'
                      ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-sm'
                      : 'bg-zinc-900/90 border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-amber-300'
                  }`}
                >
                  <Bookmark
                    className={`w-3.5 h-3.5 ${
                      show.manualStatus === 'watch_later' ? 'fill-zinc-950' : ''
                    }`}
                  />
                  {show.manualStatus === 'watch_later'
                    ? 'Saved in Watch Later (Tap to Resume)'
                    : 'Move to Watch Later'}
                </button>

                {/* Personal 5-star rating */}
                <div className="flex items-center gap-0.5 bg-zinc-900/90 border border-zinc-800 rounded-lg px-2 py-1">
                  <span className="text-[11px] text-zinc-400 mr-1">My Rating:</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() =>
                        onUpdateShowMeta(show.id, {
                          userRating: show.userRating === star ? undefined : star
                        })
                      }
                      className="p-0.5 hover:scale-110 transition"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          (show.userRating ?? 0) >= star
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative z-10 mt-4 pt-3 border-t border-zinc-800/80">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-300 font-medium">
                Watched{' '}
                <strong className="text-amber-400">{progress.watchedCount}</strong> of{' '}
                <strong>{progress.airedEpisodes}</strong> aired episodes
                {progress.totalEpisodes > progress.airedEpisodes && (
                  <span className="text-zinc-500">
                    {' '}
                    ({progress.totalEpisodes} total announced)
                  </span>
                )}
              </span>
              <span className="font-bold text-amber-400">{progress.percentAired}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-500 rounded-full"
                style={{ width: `${progress.percentAired}%` }}
              />
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Next Episode to Watch + Next Airing Banners */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Next to watch card */}
            {nextToWatch ? (
              <div className="bg-zinc-900/90 border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    <Play className="w-3 h-3 fill-amber-400" />
                    Up Next to Watch
                  </div>
                  <div className="mt-1 font-semibold text-sm text-white truncate">
                    <span className="text-amber-300 font-mono mr-1.5">
                      {formatEpisodeCode(nextToWatch.season, nextToWatch.number)}
                    </span>
                    {nextToWatch.name}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {progress.remainingToWatch} aired episode
                    {progress.remainingToWatch === 1 ? '' : 's'} remaining
                  </div>
                </div>
                <button
                  onClick={() => handleEpisodeCheckClick(nextToWatch)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  Watched
                </button>
              </div>
            ) : (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <CheckCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    All Caught Up!
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    You&apos;ve watched all aired episodes of {show.name}.
                  </div>
                </div>
              </div>
            )}

            {/* Next Upcoming Air Date card */}
            {nextUpcoming && upcomingCountdown ? (
              <div className="bg-zinc-900/90 border border-sky-500/30 rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-400">
                    <Calendar className="w-3.5 h-3.5" />
                    Next Episode Airs
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    {upcomingCountdown.badge}
                  </span>
                </div>
                <div className="mt-1 font-semibold text-sm text-white truncate">
                  <span className="text-sky-300 font-mono mr-1.5">
                    {formatEpisodeCode(nextUpcoming.season, nextUpcoming.number)}
                  </span>
                  {nextUpcoming.name}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">{upcomingCountdown.detail}</div>
              </div>
            ) : (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 flex-shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Next Air Date
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {show.status === 'Running'
                      ? 'TBA — Waiting for network schedule announcement'
                      : `Series ${show.status.toLowerCase()}`}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TV Time style "Mark previous episodes as watched?" prompt */}
          {previousPromptEp && (
            <div className="bg-amber-500/10 border border-amber-400/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-200">
                <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>
                  Marked{' '}
                  <strong>
                    {formatEpisodeCode(previousPromptEp.season, previousPromptEp.number)}
                  </strong>{' '}
                  watched. Also mark all earlier aired episodes as watched?
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onMarkUpToEpisode(show.id, previousPromptEp);
                    setPreviousPromptEp(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs transition cursor-pointer"
                >
                  Yes, Mark Previous
                </button>
                <button
                  onClick={() => setPreviousPromptEp(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition cursor-pointer"
                >
                  No, Just This One
                </button>
              </div>
            </div>
          )}

          {/* Season Selector Pills */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Seasons & Episodes
              </h3>
              {progress.remainingToWatch > 0 && (
                <button
                  onClick={() => onMarkAllAired(show.id)}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all aired watched
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {seasons.map((sNum) => {
                const epsInSeason = show.episodes.filter((e) => e.season === sNum);
                const watchedInSeason = epsInSeason.filter((e) => watchedSet.has(e.id)).length;
                const isComplete = epsInSeason.length > 0 && watchedInSeason === epsInSeason.length;
                const isSelected = selectedSeason === sNum;

                return (
                  <button
                    key={sNum}
                    onClick={() => setSelectedSeason(sNum)}
                    className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-zinc-950 border-amber-400 shadow-sm'
                        : isComplete
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <span>Season {sNum}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-zinc-950/20 text-zinc-950 font-bold'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {watchedInSeason}/{epsInSeason.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Season Header & Bulk Toggle */}
          <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-4 py-2.5">
            <div className="text-xs text-zinc-300">
              <strong className="text-white">Season {selectedSeason}</strong> •{' '}
              {seasonStats.watched} of {seasonStats.total} episodes watched
            </div>
            <button
              onClick={() =>
                onToggleSeason(show.id, selectedSeason, !seasonStats.allSeasonWatched)
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                seasonStats.allSeasonWatched
                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-amber-400/15 text-amber-300 border border-amber-400/30 hover:bg-amber-400/25'
              }`}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {seasonStats.allSeasonWatched ? 'Unmark Season' : 'Mark Season Watched'}
            </button>
          </div>

          {/* Episode List */}
          <div className="space-y-2">
            {seasonEpisodes.map((ep) => {
              const isWatched = watchedSet.has(ep.id);
              const aired = isEpisodeAired(ep, now);
              const airDateObj = getEpisodeAirDate(ep);
              const countdown = !aired ? formatAirDateCountdown(ep, now) : null;
              const isExpanded = expandedEpId === ep.id;
              const isNextUp = nextToWatch?.id === ep.id;

              return (
                <div
                  key={ep.id}
                  className={`rounded-xl border transition ${
                    isNextUp
                      ? 'bg-amber-500/[0.07] border-amber-400/40'
                      : isWatched
                      ? 'bg-zinc-900/40 border-zinc-800/60 opacity-80'
                      : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="p-3 sm:p-3.5 flex items-center justify-between gap-3">
                    <div
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                      onClick={() => setExpandedEpId(isExpanded ? null : ep.id)}
                    >
                      <div
                        className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center flex-shrink-0 font-mono text-xs font-bold border ${
                          isWatched
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : isNextUp
                            ? 'bg-amber-400/20 border-amber-400/40 text-amber-300'
                            : aired
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                            : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                        }`}
                      >
                        <span className="text-[10px] opacity-75">S{ep.season}</span>
                        <span>E{String(ep.number ?? 0).padStart(2, '0')}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-semibold truncate ${
                              isWatched ? 'line-through text-zinc-400' : 'text-white'
                            }`}
                          >
                            {ep.name}
                          </span>
                          {isNextUp && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-400 text-zinc-950">
                              Next Up
                            </span>
                          )}
                          {!aired && countdown && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              {countdown.badge}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 mt-0.5 text-xs text-zinc-400">
                          {airDateObj ? (
                            <span>
                              {aired ? 'Aired ' : 'Airs '}
                              {airDateObj.toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                              {!aired && ep.airtime ? ` at ${ep.airtime}` : ''}
                            </span>
                          ) : (
                            <span className="text-zinc-500">Air date TBA</span>
                          )}
                          {ep.runtime && <span>• {ep.runtime}m</span>}
                          {ep.summary && (
                            <span className="text-zinc-500 flex items-center gap-0.5">
                              {isExpanded ? (
                                <>
                                  Hide info <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  Synopsis <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Check-off Button */}
                    <button
                      onClick={() => handleEpisodeCheckClick(ep)}
                      title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border transition cursor-pointer ${
                        isWatched
                          ? 'bg-amber-400 border-amber-400 text-zinc-950 shadow-sm hover:bg-amber-300'
                          : aired
                          ? 'bg-zinc-800/90 border-zinc-700 text-zinc-400 hover:border-amber-400 hover:text-amber-400'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400'
                      }`}
                    >
                      <Check className="w-5 h-5 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* Expanded Episode Synopsis & Actions */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-zinc-800/60 text-xs text-zinc-300 space-y-2.5">
                      {ep.image?.medium && (
                        <img
                          src={ep.image.medium}
                          alt={ep.name}
                          className="w-full max-h-44 object-cover rounded-lg border border-zinc-800"
                        />
                      )}
                      <p className="leading-relaxed text-zinc-300">
                        {stripHtml(ep.summary) || 'No synopsis available for this episode.'}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => onMarkUpToEpisode(show.id, ep)}
                          className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          Mark this &amp; all previous episodes watched
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Personal Notes & Remove Show Footer */}
          <div className="pt-4 border-t border-zinc-800/80 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Personal Show Notes
              </label>
              <textarea
                rows={2}
                value={show.userNotes || ''}
                onChange={(e) => onUpdateShowMeta(show.id, { userNotes: e.target.value })}
                placeholder="Add notes, where you stream it, or favorite moments..."
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs sm:text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-zinc-500">
                Last synced {new Date(show.lastUpdated).toLocaleDateString()}
              </span>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove from Watchlist
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-300">Remove show &amp; progress?</span>
                  <button
                    onClick={() => {
                      onRemoveShow(show.id);
                      onClose();
                    }}
                    className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold cursor-pointer"
                  >
                    Confirm Remove
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
