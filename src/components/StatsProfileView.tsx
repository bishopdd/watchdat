import React, { useMemo, useRef } from 'react';
import {
  Clock,
  Tv,
  CheckCircle2,
  BarChart3,
  Download,
  Upload,
  RefreshCw,
  Award,
  History,
  Flame,
  Smartphone,
  FileArchive,
  Cloud
} from 'lucide-react';
import { TrackedShow, WatchActivityItem } from '../types/tv';
import {
  getComputedWatchTab,
  formatEpisodeCode,
  getShowProgress
} from '../services/tvmaze';
import { exportBackupJson, WatchDatBackupPayload } from '../services/storage';

interface StatsProfileViewProps {
  shows: TrackedShow[];
  activity: WatchActivityItem[];
  onSelectShow: (show: TrackedShow) => void;
  onImportBackup: (payload: WatchDatBackupPayload) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  isRefreshingAll: boolean;
  canInstallPwa: boolean;
  onInstallPwa: () => void;
  onOpenTVTimeImport: () => void;
  userEmail: string | null;
  onOpenAuthModal: () => void;
}

export const StatsProfileView: React.FC<StatsProfileViewProps> = ({
  shows,
  activity,
  onSelectShow,
  onImportBackup,
  onRefreshAll,
  isRefreshingAll,
  canInstallPwa,
  onInstallPwa,
  onOpenTVTimeImport,
  userEmail,
  onOpenAuthModal
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const now = useMemo(() => new Date(), [shows]);

  // Compute comprehensive TV Time-style stats
  const stats = useMemo(() => {
    let totalWatchedEpisodes = 0;
    let totalMinutesWatched = 0;
    let completedShows = 0;
    let activeWatchingShows = 0;
    let totalAiredAcrossTracked = 0;

    const genreMinutes: Record<string, number> = {};
    const showHoursList: Array<{
      show: TrackedShow;
      episodesWatched: number;
      minutesWatched: number;
      percent: number;
    }> = [];

    for (const show of shows) {
      const watchedSet = new Set(show.watchedEpisodeIds);
      const progress = getShowProgress(show, now);
      const tab = getComputedWatchTab(show, now);

      if (tab === 'completed') completedShows++;
      if (tab === 'watching' || tab === 'upcoming') activeWatchingShows++;
      totalAiredAcrossTracked += progress.airedEpisodes;

      let showMinutes = 0;
      let showEpCount = 0;

      for (const ep of show.episodes) {
        if (watchedSet.has(ep.id)) {
          const epRuntime = ep.runtime || show.averageRuntime || 45;
          showMinutes += epRuntime;
          showEpCount++;
        }
      }

      totalWatchedEpisodes += showEpCount;
      totalMinutesWatched += showMinutes;

      for (const genre of show.genres) {
        genreMinutes[genre] = (genreMinutes[genre] || 0) + showMinutes;
      }

      if (showEpCount > 0) {
        showHoursList.push({
          show,
          episodesWatched: showEpCount,
          minutesWatched: showMinutes,
          percent: progress.percentAired
        });
      }
    }

    // Break totalMinutesWatched into Months (30d), Days (24h), Hours
    const totalHours = Math.floor(totalMinutesWatched / 60);
    const months = Math.floor(totalMinutesWatched / (60 * 24 * 30));
    const remAfterMonths = totalMinutesWatched % (60 * 24 * 30);
    const days = Math.floor(remAfterMonths / (60 * 24));
    const remAfterDays = remAfterMonths % (60 * 24);
    const hours = Math.floor(remAfterDays / 60);
    const minutes = remAfterDays % 60;

    const topGenres = Object.entries(genreMinutes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const maxGenreMin = topGenres.length > 0 ? topGenres[0][1] : 1;

    const topShowsByTime = showHoursList
      .sort((a, b) => b.minutesWatched - a.minutesWatched)
      .slice(0, 6);

    const overallCompletionRate =
      totalAiredAcrossTracked > 0
        ? Math.round((totalWatchedEpisodes / totalAiredAcrossTracked) * 100)
        : 0;

    return {
      totalWatchedEpisodes,
      totalMinutesWatched,
      totalHours,
      months,
      days,
      hours,
      minutes,
      completedShows,
      activeWatchingShows,
      overallCompletionRate,
      topGenres,
      maxGenreMin,
      topShowsByTime
    };
  }, [shows, now]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as WatchDatBackupPayload;
      if (parsed && Array.isArray(parsed.shows)) {
        await onImportBackup(parsed);
      } else {
        alert('Invalid WatchDat backup JSON file.');
      }
    } catch {
      alert('Could not parse backup file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* TV Time Iconic Total Time Clock Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#191d2c] via-[#131621] to-[#0f1118] border border-amber-400/30 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-extrabold uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              Total TV Time Watched
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-white">
              Your Viewing Profile &amp; Stats
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Calculated from every episode runtime you&apos;ve checked off across {shows.length}{' '}
              tracked {shows.length === 1 ? 'show' : 'shows'}
            </p>
          </div>

          {/* Digital Time Counter */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 bg-zinc-950/80 border border-zinc-800/90 rounded-2xl p-3.5 sm:p-4 text-center">
            <div className="px-2">
              <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                {String(stats.months).padStart(2, '0')}
              </div>
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 mt-0.5">
                Months
              </div>
            </div>
            <div className="px-2 border-l border-zinc-800">
              <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                {String(stats.days).padStart(2, '0')}
              </div>
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 mt-0.5">
                Days
              </div>
            </div>
            <div className="px-2 border-l border-zinc-800">
              <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                {String(stats.hours).padStart(2, '0')}
              </div>
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-400 mt-0.5">
                Hours
              </div>
            </div>
            <div className="px-2 border-l border-zinc-800">
              <div className="text-2xl sm:text-3xl font-black text-zinc-200 font-mono">
                {String(stats.minutes).padStart(2, '0')}
              </div>
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-500 mt-0.5">
                Mins
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold">
            <span>Episodes Watched</span>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {stats.totalWatchedEpisodes.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {stats.totalHours.toLocaleString()} total hours
          </div>
        </div>

        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold">
            <span>Shows Tracked</span>
            <Tv className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">{shows.length}</div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {stats.activeWatchingShows} active / upcoming
          </div>
        </div>

        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold">
            <span>Shows Completed</span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">{stats.completedShows}</div>
          <div className="mt-1 text-[11px] text-zinc-500">100% watched &amp; ended</div>
        </div>

        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold">
            <span>Completion Rate</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {stats.overallCompletionRate}%
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">Of aired episodes in library</div>
        </div>
      </div>

      {/* Top Genres & Most Watched Shows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Genres */}
        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-amber-400" />
            Top Genres by Watch Time
          </h2>

          {stats.topGenres.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              Mark episodes as watched to see your favorite genres breakdown.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.topGenres.map(([genre, mins]) => {
                const hrs = (mins / 60).toFixed(1);
                const pct = Math.max(8, Math.round((mins / stats.maxGenreMin) * 100));
                return (
                  <div key={genre}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-zinc-200">{genre}</span>
                      <span className="text-zinc-400 font-mono">{hrs} hrs</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Most Watched Shows */}
        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-amber-400" />
            Most Watched Series
          </h2>

          {stats.topShowsByTime.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              Your most-binged TV shows will appear here once you check off episodes.
            </p>
          ) : (
            <div className="space-y-2.5">
              {stats.topShowsByTime.map(({ show, episodesWatched, minutesWatched, percent }) => (
                <div
                  key={show.id}
                  onClick={() => onSelectShow(show)}
                  className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-zinc-800/60 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-12 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
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
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white truncate">
                        {show.name}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {episodesWatched} episodes • {(minutesWatched / 60).toFixed(1)} hours
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-amber-400 font-mono">
                    {percent}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Watch History & Backup Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Activity Log */}
        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-sky-400" />
            Recent Episode Check-ins
          </h2>

          {activity.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              No recent episode check-ins yet.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {activity.slice(0, 15).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/70 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{item.showName}</div>
                    <div className="text-zinc-400 truncate mt-0.5">
                      <span className="text-amber-300 font-mono mr-1.5">
                        {formatEpisodeCode(item.season, item.number)}
                      </span>
                      {item.episodeTitle}
                    </div>
                  </div>
                  <span className="text-[11px] text-zinc-500 flex-shrink-0">
                    {new Date(item.timestamp).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PWA & Local Data Backup */}
        <div className="bg-[#141722] border border-zinc-800/90 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-2 mb-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              PWA Offline Storage &amp; Backup
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              WatchDat stores your tracked shows, episode check-offs, and air date schedules
              locally in IndexedDB so it works fast and offline as a Progressive Web App. You can
              export or restore your library at any time.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-2">
            <button
              onClick={onOpenAuthModal}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer ${
                userEmail
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300'
                  : 'bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300'
              }`}
            >
              <Cloud className="w-4 h-4" />
              {userEmail ? `Cloud Sync (${userEmail})` : 'Sign In for Cloud Sync'}
            </button>

            <button
              onClick={onOpenTVTimeImport}
              className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
            >
              <FileArchive className="w-4 h-4 stroke-[2.25]" />
              Import TV Time Export (.zip / .csv)
            </button>

            {canInstallPwa && (
              <button
                onClick={onInstallPwa}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-amber-400/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                Install WatchDat App
              </button>
            )}

            <button
              onClick={onRefreshAll}
              disabled={isRefreshingAll || shows.length === 0}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin text-amber-400' : ''}`}
              />
              {isRefreshingAll ? 'Syncing Schedules...' : 'Sync All Air Dates'}
            </button>

            <button
              onClick={() => exportBackupJson(shows, activity)}
              disabled={shows.length === 0}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Export Backup JSON
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              Import Backup JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
