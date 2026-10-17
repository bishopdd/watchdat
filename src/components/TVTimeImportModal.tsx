import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileArchive,
  FileSpreadsheet,
  Check,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  HelpCircle
} from 'lucide-react';
import {
  ParsedTVTimeShow,
  TVTimeParseResult,
  parseTVTimeFiles,
  parseTextListShows,
  executeTVTimeImport,
  ImportProgressUpdate
} from '../services/tvtimeImport';
import { TrackedShow, WatchActivityItem } from '../types/tv';

interface TVTimeImportModalProps {
  existingShows: TrackedShow[];
  existingActivity: WatchActivityItem[];
  onClose: () => void;
  onImportComplete: (
    mergedShows: TrackedShow[],
    mergedActivity: WatchActivityItem[],
    importedCount: number
  ) => void;
}

export const TVTimeImportModal: React.FC<TVTimeImportModalProps> = ({
  existingShows,
  existingActivity,
  onClose,
  onImportComplete
}) => {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<TVTimeParseResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pasteText, setPasteText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgressUpdate | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesSelected = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const res = await parseTVTimeFiles(files);
      if (res.shows.length === 0) {
        setParseError(
          'No TV shows or watched episode records were found in the selected file(s). Try selecting the full TV Time GDPR .zip archive, or seen_episode.csv / followed_tv_show.csv / tracking-prod-records.csv.'
        );
      } else {
        setParseResult(res);
        setSelectedKeys(new Set(res.shows.map((s) => s.key)));
      }
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to parse TV Time export files.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleParseText = () => {
    if (!pasteText.trim()) return;
    const res = parseTextListShows(pasteText);
    if (res.shows.length === 0) {
      setParseError('Could not detect any show names in your text.');
      return;
    }
    setParseError(null);
    setParseResult(res);
    setSelectedKeys(new Set(res.shows.map((s) => s.key)));
  };

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!parseResult) return;
    if (selectedKeys.size === parseResult.shows.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(parseResult.shows.map((s) => s.key)));
    }
  };

  const updateShowOverride = (key: string, override: 'csv' | 'all_aired' | 'watch_later') => {
    if (!parseResult) return;
    setParseResult({
      ...parseResult,
      shows: parseResult.shows.map((s) => {
        if (s.key !== key) return s;
        if (override === 'all_aired') {
          return { ...s, markAllAired: true, isWatchLater: false };
        }
        if (override === 'watch_later') {
          return { ...s, markAllAired: false, isWatchLater: true };
        }
        return { ...s, markAllAired: false, isWatchLater: false };
      })
    });
  };

  const handleStartImport = async () => {
    if (!parseResult) return;
    const toImport = parseResult.shows.filter((s) => selectedKeys.has(s.key));
    if (toImport.length === 0) return;

    setIsImporting(true);
    try {
      const result = await executeTVTimeImport(
        toImport,
        existingShows,
        existingActivity,
        (update) => setProgress(update)
      );
      onImportComplete(result.mergedShows, result.mergedActivity, result.importedCount);
    } finally {
      setIsImporting(false);
    }
  };

  const getEpisodeSummaryBadge = (s: ParsedTVTimeShow) => {
    if (s.markAllAired) return 'All Aired Watched';
    if (s.isWatchLater && s.episodes.length === 0 && s.rawEpisodeIds.size === 0) {
      return 'Watch Later';
    }
    if (s.upToSeason !== undefined && s.upToEpisode !== undefined) {
      return s.upToEpisode >= 999
        ? `Through Season ${s.upToSeason}`
        : `Up to S${String(s.upToSeason).padStart(2, '0')}E${String(s.upToEpisode).padStart(
            2,
            '0'
          )}`;
    }
    if (s.episodes.length > 0) {
      return `${s.episodes.length} ep${s.episodes.length === 1 ? '' : 's'} watched`;
    }
    if (s.rawEpisodeIds.size > 0) {
      return `${s.rawEpisodeIds.size} ep${s.rawEpisodeIds.size === 1 ? '' : 's'} watched`;
    }
    if (s.isArchived) return 'Archived (All Aired)';
    return 'Followed Show';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
      onClick={() => !isImporting && onClose()}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-[#12141c] border border-zinc-800/90 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-gradient-to-r from-[#171a26] to-[#12141c]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <FileArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Import Your TV Time History
              </h2>
              <p className="text-xs text-zinc-400">
                Upload your TV Time GDPR data export (.zip, .csv, or .json) or paste a show list
              </p>
            </div>
          </div>
          {!isImporting && (
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Active Importing Progress State */}
          {isImporting && progress ? (
            <div className="py-10 text-center space-y-4">
              <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto" />
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Matching Shows &amp; Episode History with TVMaze...
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Processing{' '}
                  <strong className="text-amber-300">{progress.currentLabel}</strong> (
                  {progress.current} of {progress.total})
                </p>
              </div>

              <div className="max-w-md mx-auto">
                <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.round((progress.current / progress.total) * 100)}%`
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2">
                  <span>{progress.importedCount} shows synced</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
              </div>
            </div>
          ) : !parseResult ? (
            <>
              {/* Mode Switcher */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  <button
                    onClick={() => {
                      setMode('upload');
                      setParseError(null);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      mode === 'upload'
                        ? 'bg-amber-400 text-zinc-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    TV Time Export Files (.zip / .csv / .json)
                  </button>
                  <button
                    onClick={() => {
                      setMode('paste');
                      setParseError(null);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      mode === 'paste'
                        ? 'bg-amber-400 text-zinc-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Paste Show List
                  </button>
                </div>

                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className="text-xs text-zinc-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Supported files?
                </button>
              </div>

              {showHelp && (
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-300 space-y-1.5">
                  <div className="font-bold text-amber-300">
                    What TV Time GDPR Export files are supported?
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-zinc-400">
                    <li>
                      Drop the entire <strong>.zip archive</strong> from TV Time directly —
                      WatchDat automatically extracts and merges all CSV/JSON files inside!
                    </li>
                    <li>
                      Or select individual extracted files together, such as{' '}
                      <code className="text-zinc-200">seen_episode.csv</code>,{' '}
                      <code className="text-zinc-200">followed_tv_show.csv</code>,{' '}
                      <code className="text-zinc-200">tracking-prod-records.csv</code>, or{' '}
                      <code className="text-zinc-200">watched_episodes.csv</code>.
                    </li>
                    <li>
                      WatchDat resolves TV Time&apos;s native <strong>TheTVDB IDs</strong> (
                      <code className="text-zinc-200">series_id</code> /{' '}
                      <code className="text-zinc-200">tv_show_id</code>) as well as show names and
                      marks your watched episodes automatically.
                    </li>
                  </ul>
                </div>
              )}

              {mode === 'upload' ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) {
                      handleFilesSelected(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center transition cursor-pointer ${
                    isDragging
                      ? 'border-amber-400 bg-amber-400/10'
                      : 'border-zinc-700/80 hover:border-amber-400/60 bg-zinc-900/40 hover:bg-zinc-900/70'
                  }`}
                >
                  {isParsing ? (
                    <div className="space-y-2 py-4">
                      <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
                      <p className="text-sm font-bold text-white">
                        Reading your TV Time export...
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center mx-auto mb-3 text-amber-400">
                        <Upload className="w-7 h-7" />
                      </div>
                      <p className="text-sm sm:text-base font-bold text-white">
                        Drop your TV Time <span className="text-amber-400">.zip</span>,{' '}
                        <span className="text-amber-400">.csv</span>, or{' '}
                        <span className="text-amber-400">.json</span> file(s) here
                      </p>
                      <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                        You can select multiple files at once (e.g. both{' '}
                        <code>followed_tv_show.csv</code> and <code>seen_episode.csv</code>) or
                        drop the full GDPR export ZIP
                      </p>
                      <button
                        type="button"
                        className="mt-4 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs shadow transition cursor-pointer"
                      >
                        Browse Files
                      </button>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".zip,.csv,.json,.txt,.tsv"
                    onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Paste one show per line (optionally with your last watched episode like{' '}
                    <code className="text-amber-300">S02E05</code> or{' '}
                    <code className="text-amber-300">Season 2</code>):
                  </label>
                  <textarea
                    rows={6}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`Severance S01E09\nThe Bear S02E10\nStranger Things Season 4\nBreaking Bad`}
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-xs sm:text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-400 font-mono"
                  />
                  <button
                    onClick={handleParseText}
                    disabled={!pasteText.trim()}
                    className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    Preview Shows to Import
                  </button>
                </div>
              )}

              {parseError && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}
            </>
          ) : (
            /* Preview & Selection Step */
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div className="text-xs">
                    <div className="font-bold text-white">
                      Found {parseResult.shows.length} TV Shows
                      {parseResult.totalEpisodeRecords > 0 &&
                        ` & ${parseResult.totalEpisodeRecords.toLocaleString()} watched episode records`}
                    </div>
                    <div className="text-zinc-400">
                      Parsed from: {parseResult.filesProcessed.join(', ')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setParseResult(null);
                    setParseError(null);
                  }}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  Choose Different File
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span>
                  Selected <strong className="text-white">{selectedKeys.size}</strong> of{' '}
                  {parseResult.shows.length} shows to import
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                >
                  {selectedKeys.size === parseResult.shows.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {parseResult.shows.map((s) => {
                  const isSelected = selectedKeys.has(s.key);
                  const label =
                    s.showName ||
                    (s.tvdbId ? `TV Show (TheTVDB ID #${s.tvdbId})` : s.imdbId || 'Unknown Show');

                  return (
                    <div
                      key={s.key}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition ${
                        isSelected
                          ? 'bg-zinc-900/90 border-zinc-700/80'
                          : 'bg-zinc-900/30 border-zinc-800/50 opacity-55'
                      }`}
                    >
                      <div
                        onClick={() => toggleSelectKey(s.key)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                      >
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border flex-shrink-0 ${
                            isSelected
                              ? 'bg-amber-400 border-amber-400 text-zinc-950'
                              : 'border-zinc-700 bg-zinc-900'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-white truncate">
                            {label}
                          </div>
                          {s.tvdbId && s.showName && (
                            <div className="text-[10px] text-zinc-500">TVDB #{s.tvdbId}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-bold">
                          {getEpisodeSummaryBadge(s)}
                        </span>

                        <select
                          value={
                            s.markAllAired
                              ? 'all_aired'
                              : s.isWatchLater &&
                                s.episodes.length === 0 &&
                                s.rawEpisodeIds.size === 0
                              ? 'watch_later'
                              : 'csv'
                          }
                          onChange={(e) =>
                            updateShowOverride(
                              s.key,
                              e.target.value as 'csv' | 'all_aired' | 'watch_later'
                            )
                          }
                          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-amber-400"
                        >
                          <option value="csv">From Export</option>
                          <option value="all_aired">Mark All Aired Watched</option>
                          <option value="watch_later">Watch Later</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {parseResult && !isImporting && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-400">
              Existing shows in your library will have their watched episodes safely merged.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleStartImport}
                disabled={selectedKeys.size === 0}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-lg transition disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Import {selectedKeys.size} {selectedKeys.size === 1 ? 'Show' : 'Shows'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
