import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Tv,
  ChevronLeft,
  ChevronRight,
  Bell,
  Sparkles,
  ListFilter,
  RefreshCw
} from 'lucide-react';
import { TrackedShow, TVMazeEpisode } from '../types/tv';
import {
  getEpisodeAirDate,
  formatEpisodeCode,
  formatAirDateCountdown,
  CountdownInfo
} from '../services/tvmaze';

interface UpcomingViewProps {
  shows: TrackedShow[];
  onSelectShow: (show: TrackedShow) => void;
  onRefreshAll: () => Promise<void>;
  isRefreshingAll: boolean;
  onGoToDiscover: () => void;
}

interface ScheduledEpisodeEntry {
  show: TrackedShow;
  episode: TVMazeEpisode;
  airDate: Date;
  countdown: CountdownInfo;
  isNextForShow: boolean;
}

export const UpcomingView: React.FC<UpcomingViewProps> = ({
  shows,
  onSelectShow,
  onRefreshAll,
  isRefreshingAll,
  onGoToDiscover
}) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [onlyNextPerShow, setOnlyNextPerShow] = useState<boolean>(false);

  const now = useMemo(() => new Date(), [shows]);
  const [calMonth, setCalMonth] = useState<Date>(
    () => new Date(now.getFullYear(), now.getMonth(), 1)
  );

  // Gather all future episodes across tracked shows
  const upcomingEntries = useMemo(() => {
    const entries: ScheduledEpisodeEntry[] = [];

    for (const show of shows) {
      const futureEps = show.episodes
        .map((ep) => ({ ep, airDate: getEpisodeAirDate(ep) }))
        .filter(
          (item): item is { ep: TVMazeEpisode; airDate: Date } =>
            item.airDate !== null &&
            item.airDate.getTime() >=
              new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        )
        .sort((a, b) => a.airDate.getTime() - b.airDate.getTime());

      futureEps.forEach((item, idx) => {
        if (onlyNextPerShow && idx > 0) return;
        const countdown = formatAirDateCountdown(item.ep, now);
        if (countdown) {
          entries.push({
            show,
            episode: item.ep,
            airDate: item.airDate,
            countdown,
            isNextForShow: idx === 0
          });
        }
      });
    }

    return entries.sort((a, b) => a.airDate.getTime() - b.airDate.getTime());
  }, [shows, now, onlyNextPerShow]);

  // Shows that are 'Running' or 'In Development' or 'To Be Determined' with NO announced future episode
  const tbaRunningShows = useMemo(() => {
    const showsWithFutureEp = new Set(upcomingEntries.map((e) => e.show.id));
    return shows.filter(
      (s) =>
        !showsWithFutureEp.has(s.id) &&
        (s.status === 'Running' ||
          s.status === 'To Be Determined' ||
          s.status === 'In Development')
    );
  }, [shows, upcomingEntries]);

  // Group timeline entries by urgency
  const groupedTimeline = useMemo(() => {
    const groups: Record<'today' | 'tomorrow' | 'this_week' | 'later', ScheduledEpisodeEntry[]> =
      {
        today: [],
        tomorrow: [],
        this_week: [],
        later: []
      };

    for (const entry of upcomingEntries) {
      groups[entry.countdown.urgency].push(entry);
    }
    return groups;
  }, [upcomingEntries]);

  // Calendar grid generation for calMonth
  const calendarDays = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun
    const totalDays = lastDayOfMonth.getDate();

    const cells: Array<{
      date: Date | null;
      dayNum: number | null;
      isToday: boolean;
      episodes: ScheduledEpisodeEntry[];
    }> = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ date: null, dayNum: null, isToday: false, episodes: [] });
    }

    // Collect all episodes in this month across all tracked shows (including already aired earlier in the month)
    const monthEpisodes: ScheduledEpisodeEntry[] = [];
    for (const show of shows) {
      for (const ep of show.episodes) {
        const d = getEpisodeAirDate(ep);
        if (d && d.getFullYear() === year && d.getMonth() === month) {
          const countdown = formatAirDateCountdown(ep, now) || {
            badge: 'Aired',
            detail: '',
            exactDateStr: '',
            timeStr: ep.airtime || '',
            urgency: 'later' as const,
            diffMs: 0,
            daysAway: 0
          };
          monthEpisodes.push({
            show,
            episode: ep,
            airDate: d,
            countdown,
            isNextForShow: false
          });
        }
      }
    }

    for (let day = 1; day <= totalDays; day++) {
      const cellDate = new Date(year, month, day);
      const isToday =
        cellDate.getFullYear() === now.getFullYear() &&
        cellDate.getMonth() === now.getMonth() &&
        cellDate.getDate() === now.getDate();

      const epsForDay = monthEpisodes.filter((e) => e.airDate.getDate() === day);
      cells.push({
        date: cellDate,
        dayNum: day,
        isToday,
        episodes: epsForDay
      });
    }

    return cells;
  }, [calMonth, shows, now]);

  const sections: Array<{
    key: 'today' | 'tomorrow' | 'this_week' | 'later';
    title: string;
    subtitle: string;
    accentClass: string;
  }> = [
    {
      key: 'today',
      title: 'Airing Today',
      subtitle: 'Episodes premiering today',
      accentClass: 'bg-amber-400 text-zinc-950'
    },
    {
      key: 'tomorrow',
      title: 'Airing Tomorrow',
      subtitle: 'Set your reminders for tomorrow',
      accentClass: 'bg-sky-400 text-zinc-950'
    },
    {
      key: 'this_week',
      title: 'Next 7 Days',
      subtitle: 'Coming up later this week',
      accentClass: 'bg-emerald-400 text-zinc-950'
    },
    {
      key: 'later',
      title: 'Coming Later',
      subtitle: 'Scheduled further ahead on the calendar',
      accentClass: 'bg-purple-400 text-zinc-950'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#141722] border border-zinc-800/90 rounded-2xl p-4 sm:p-5">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-amber-400" />
            Upcoming Air Dates &amp; Schedule
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Track exact countdowns for when the next episode of your shows will air
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'timeline' && (
            <button
              onClick={() => setOnlyNextPerShow(!onlyNextPerShow)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                onlyNextPerShow
                  ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              {onlyNextPerShow ? 'Next Episode Only' : 'All Scheduled Episodes'}
            </button>
          )}

          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-amber-400 text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Countdown List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-amber-400 text-zinc-950'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Calendar
            </button>
          </div>

          <button
            onClick={onRefreshAll}
            disabled={isRefreshingAll || shows.length === 0}
            title="Sync latest episode air dates from TVMaze"
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">Sync Schedule</span>
          </button>
        </div>
      </div>

      {/* Timeline Mode */}
      {viewMode === 'timeline' && (
        <div className="space-y-7">
          {upcomingEntries.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-8 text-center">
              <Bell className="w-10 h-10 text-amber-400/70 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">
                No Confirmed Upcoming Air Dates Right Now
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                {shows.length === 0
                  ? 'Add TV shows to your library to track when their next episode airs.'
                  : 'None of your currently tracked shows have an announced future episode date yet, or they have finished airing.'}
              </p>
              <button
                onClick={onGoToDiscover}
                className="mt-4 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs transition cursor-pointer"
              >
                Browse Currently Airing Shows
              </button>
            </div>
          ) : (
            sections.map((section) => {
              const items = groupedTimeline[section.key];
              if (items.length === 0) return null;

              return (
                <div key={section.key} className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${section.accentClass}`}
                    >
                      {items.length}
                    </span>
                    <h2 className="text-base font-extrabold text-white">{section.title}</h2>
                    <span className="text-xs text-zinc-500 hidden sm:inline">
                      • {section.subtitle}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map(({ show, episode, countdown }) => (
                      <div
                        key={`${show.id}-${episode.id}`}
                        onClick={() => onSelectShow(show)}
                        className="group bg-[#141722] hover:bg-[#191d2b] border border-zinc-800/90 hover:border-sky-500/40 rounded-2xl p-3.5 flex items-center gap-3.5 transition cursor-pointer shadow"
                      >
                        {/* Show Poster */}
                        <div className="w-14 h-20 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 border border-zinc-700/60">
                          {show.image?.medium ? (
                            <img
                              src={show.image.medium}
                              alt={show.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Tv className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        {/* Airing Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-zinc-300 truncate">
                              {show.name}
                            </span>
                            <span
                              className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                                section.key === 'today'
                                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                                  : section.key === 'tomorrow'
                                  ? 'bg-sky-400/20 text-sky-300 border-sky-400/40'
                                  : 'bg-zinc-800 text-zinc-200 border-zinc-700'
                              }`}
                            >
                              {countdown.badge}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 font-mono text-xs font-bold">
                              {formatEpisodeCode(episode.season, episode.number)}
                            </span>
                            {episode.number === 1 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[10px] font-bold uppercase flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" />
                                Season Premiere
                              </span>
                            )}
                            <span className="text-sm font-bold text-white truncate">
                              {episode.name}
                            </span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                            <span className="flex items-center gap-1 text-zinc-300 font-medium">
                              <Clock className="w-3.5 h-3.5 text-sky-400" />
                              {countdown.detail}
                            </span>
                            {show.networkName && (
                              <span className="text-zinc-500">• {show.networkName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {/* Returning Shows Awaiting Air Date Announcement */}
          {tbaRunningShows.length > 0 && (
            <div className="pt-4 border-t border-zinc-800/80 space-y-3">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-300">
                  Returning Series • Next Air Date TBA ({tbaRunningShows.length})
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Active shows in your library that are still in production or awaiting next season
                  air dates
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {tbaRunningShows.map((show) => (
                  <div
                    key={show.id}
                    onClick={() => onSelectShow(show)}
                    className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 rounded-xl p-3 flex items-center gap-3 cursor-pointer transition"
                  >
                    <div className="w-11 h-16 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                      {show.image?.medium ? (
                        <img
                          src={show.image.medium}
                          alt={show.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Tv className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-white truncate">{show.name}</h3>
                      <div className="text-xs text-emerald-400 font-medium mt-0.5">
                        Status: {show.status}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {show.schedule.days.length > 0
                          ? `Usually ${show.schedule.days.join(', ')}${
                              show.schedule.time ? ` at ${show.schedule.time}` : ''
                            }`
                          : show.networkName || 'Date TBA'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Calendar Mode */}
      {viewMode === 'calendar' && (
        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl overflow-hidden shadow-xl">
          {/* Calendar Month Navigation */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <button
              onClick={() =>
                setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
              }
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center">
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                {calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
                className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-amber-400 cursor-pointer"
              >
                Today
              </button>
              <button
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                }
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/60 text-center py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 auto-rows-[minmax(95px,auto)] divide-x divide-y divide-zinc-800/70">
            {calendarDays.map((cell, idx) => (
              <div
                key={idx}
                className={`p-1.5 sm:p-2 transition ${
                  !cell.dayNum
                    ? 'bg-zinc-950/40'
                    : cell.isToday
                    ? 'bg-amber-400/[0.06]'
                    : 'bg-transparent'
                }`}
              >
                {cell.dayNum && (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${
                          cell.isToday
                            ? 'bg-amber-400 text-zinc-950'
                            : 'text-zinc-400'
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {cell.episodes.length > 0 && (
                        <span className="text-[10px] font-bold text-sky-400">
                          {cell.episodes.length} ep
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {cell.episodes.map(({ show, episode }) => (
                        <button
                          key={`${show.id}-${episode.id}`}
                          onClick={() => onSelectShow(show)}
                          className="w-full text-left px-1.5 py-1 rounded-md bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-[10px] leading-tight transition cursor-pointer truncate"
                        >
                          <div className="font-bold text-white truncate">{show.name}</div>
                          <div className="text-sky-300 font-mono">
                            {formatEpisodeCode(episode.season, episode.number)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
