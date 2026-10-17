import JSZip from 'jszip';
import { TrackedShow, WatchActivityItem } from '../types/tv';
import {
  resolveShowFromTVTime,
  mapRawShowToTracked,
  isEpisodeAired,
  sortEpisodes
} from './tvmaze';

export interface ParsedTVTimeEpisodeRef {
  season: number;
  episode: number;
  watchedAt?: number;
}

export interface ParsedTVTimeShow {
  key: string;
  showName?: string;
  tvdbId?: number;
  imdbId?: string;
  episodes: ParsedTVTimeEpisodeRef[];
  rawEpisodeIds: Set<string>;
  upToSeason?: number;
  upToEpisode?: number;
  markAllAired?: boolean;
  isArchived?: boolean;
  isWatchLater?: boolean;
  lastWatchedAt?: number;
}

export interface TVTimeParseResult {
  shows: ParsedTVTimeShow[];
  filesProcessed: string[];
  totalEpisodeRecords: number;
}

// RFC-4180 compliant CSV parser that auto-detects delimiter (comma, semicolon, tab)
export function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const cleaned = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  // Detect delimiter from first line
  const firstLineEnd = cleaned.indexOf('\n');
  const firstLine = firstLineEnd >= 0 ? cleaned.slice(0, firstLineEnd) : cleaned;
  let delimiter = ',';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
  else if (semiCount > commaCount) delimiter = ';';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) =>
    h
      .toLowerCase()
      .replace(/^["']|["']$/g, '')
      .trim()
  );

  const records: Array<Record<string, string>> = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && !row[0]) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) {
        obj[headers[c]] = row[c] ?? '';
      }
    }
    records.push(obj);
  }

  return records;
}

function parseTimestamp(val: string | number | undefined): number | undefined {
  if (!val) return undefined;
  if (typeof val === 'number') {
    return val < 10_000_000_000 ? val * 1000 : val;
  }
  const trimmed = String(val).trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return num < 10_000_000_000 ? num * 1000 : num;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

function parseSeasonEpisodeCode(str: string): { season: number; episode: number } | null {
  const m1 = str.match(/S(\d{1,3})\s*E(\d{1,3})/i);
  if (m1) return { season: Number(m1[1]), episode: Number(m1[2]) };
  const m2 = str.match(/(\d{1,2})x(\d{1,3})/i);
  if (m2) return { season: Number(m2[1]), episode: Number(m2[2]) };
  return null;
}

function pickField(row: Record<string, string>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== '' && row[key].toLowerCase() !== 'null') {
      return row[key];
    }
  }
  return undefined;
}

class TVTimeAggregator {
  private map = new Map<string, ParsedTVTimeShow>();
  private tvdbToKey = new Map<number, string>();
  private nameToKey = new Map<string, string>();
  public totalEpisodeRecords = 0;

  private getOrCreate(params: {
    showName?: string;
    tvdbId?: number;
    imdbId?: string;
  }): ParsedTVTimeShow | null {
    const cleanName = params.showName?.trim();
    const normName = cleanName?.toLowerCase();
    const tvdb =
      params.tvdbId && !isNaN(params.tvdbId) && params.tvdbId > 0
        ? params.tvdbId
        : undefined;

    if (!cleanName && !tvdb && !params.imdbId) return null;

    let key: string | undefined;
    if (tvdb && this.tvdbToKey.has(tvdb)) {
      key = this.tvdbToKey.get(tvdb);
    } else if (normName && this.nameToKey.has(normName)) {
      key = this.nameToKey.get(normName);
    }

    if (!key) {
      key = tvdb ? `tvdb:${tvdb}` : normName ? `name:${normName}` : `imdb:${params.imdbId}`;
    }

    let entry = this.map.get(key);
    if (!entry) {
      entry = {
        key,
        showName: cleanName,
        tvdbId: tvdb,
        imdbId: params.imdbId?.trim(),
        episodes: [],
        rawEpisodeIds: new Set<string>()
      };
      this.map.set(key, entry);
    } else {
      if (!entry.showName && cleanName) entry.showName = cleanName;
      if (!entry.tvdbId && tvdb) entry.tvdbId = tvdb;
      if (!entry.imdbId && params.imdbId) entry.imdbId = params.imdbId.trim();
    }

    if (tvdb) this.tvdbToKey.set(tvdb, key);
    if (normName) this.nameToKey.set(normName, key);

    return entry;
  }

  public ingestRow(row: Record<string, string>, fileNameLower: string) {
    // Check if there is an embedded JSON column (common in tracking-prod-records.csv)
    let mergedRow = { ...row };
    for (const jsonCol of ['data', 'properties', 'metadata', 'payload', 'attributes']) {
      if (row[jsonCol] && row[jsonCol].startsWith('{')) {
        try {
          const parsed = JSON.parse(row[jsonCol]);
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              if (v !== null && v !== undefined && !mergedRow[k.toLowerCase()]) {
                mergedRow[k.toLowerCase()] = String(v);
              }
            }
          }
        } catch {
          // Ignore malformed JSON snippet
        }
      }
    }

    // Filter out movie rows if entity_type is explicitly movie
    const entityType = pickField(mergedRow, ['entity_type', 'type', 'item_type', 'media_type']);
    if (entityType && /movie|film/i.test(entityType)) {
      return;
    }

    // Filter out explicit unfollow/unwatch events if action column exists
    const action = pickField(mergedRow, ['action', 'event', 'event_name', 'event_type']);
    if (action && /unwatch|unfollow|remove|delete/i.test(action)) {
      return;
    }

    const showName = pickField(mergedRow, [
      'series_name',
      'tv_show_name',
      'show_name',
      'show_title',
      'series_title',
      'show',
      'series',
      'title',
      'name'
    ]);

    const rawSeriesId = pickField(mergedRow, [
      'series_id',
      'tv_show_id',
      'show_id',
      'thetvdb_id',
      'tvdb_id',
      'tvdb'
    ]);

    // In followed_tv_show.csv, 'id' or 'entity_id' may be the series_id
    const fallbackSeriesId =
      !rawSeriesId &&
      (fileNameLower.includes('show') ||
        fileNameLower.includes('follow') ||
        (entityType && /show|series/i.test(entityType)))
        ? pickField(mergedRow, ['id', 'entity_id'])
        : undefined;

    const tvdbIdNum = Number(rawSeriesId || fallbackSeriesId);
    const imdbId = pickField(mergedRow, ['imdb_id', 'imdb']);

    const entry = this.getOrCreate({
      showName,
      tvdbId: !isNaN(tvdbIdNum) && tvdbIdNum > 0 ? tvdbIdNum : undefined,
      imdbId
    });

    if (!entry) return;

    const ts = parseTimestamp(
      pickField(mergedRow, [
        'watched_at',
        'created_at',
        'updated_at',
        'timestamp',
        'date',
        'seen_at'
      ])
    );
    if (ts && (!entry.lastWatchedAt || ts > entry.lastWatchedAt)) {
      entry.lastWatchedAt = ts;
    }

    // Check archive / status flags
    const archivedVal = pickField(mergedRow, ['is_archived', 'archived', 'status']);
    if (archivedVal && /^(true|1|archived|completed)$/i.test(archivedVal)) {
      entry.isArchived = true;
    }
    if (
      fileNameLower.includes('later') ||
      (archivedVal && /watch_later|plan_to_watch|to_watch/i.test(archivedVal))
    ) {
      entry.isWatchLater = true;
    }

    // Season & Episode detection
    const rawSeason = pickField(mergedRow, [
      'season_number',
      'season_num',
      'season',
      's_number',
      's'
    ]);
    const rawEpisode = pickField(mergedRow, [
      'episode_number',
      'episode_num',
      'episode',
      'ep_number',
      'number',
      'ep',
      'e'
    ]);

    let seasonNum = rawSeason !== undefined ? Number(rawSeason) : NaN;
    let episodeNum = rawEpisode !== undefined ? Number(rawEpisode) : NaN;

    if (isNaN(seasonNum) || isNaN(episodeNum)) {
      const codeStr = pickField(mergedRow, [
        'episode_code',
        'code',
        'sxe',
        'episode_title',
        'episode_name'
      ]);
      if (codeStr) {
        const parsedCode = parseSeasonEpisodeCode(codeStr);
        if (parsedCode) {
          seasonNum = parsedCode.season;
          episodeNum = parsedCode.episode;
        }
      }
    }

    if (!isNaN(seasonNum) && !isNaN(episodeNum) && seasonNum >= 0 && episodeNum > 0) {
      const exists = entry.episodes.some(
        (e) => e.season === seasonNum && e.episode === episodeNum
      );
      if (!exists) {
        entry.episodes.push({
          season: seasonNum,
          episode: episodeNum,
          watchedAt: ts
        });
        this.totalEpisodeRecords++;
      }
      return;
    }

    // What if the CSV row is in seen_episode.csv and has episode_id + series_id, but NO season/episode columns?
    const rawEpisodeId =
      pickField(mergedRow, ['episode_id', 'seen_episode_id']) ||
      (fileNameLower.includes('episode') ? pickField(mergedRow, ['id', 'entity_id']) : undefined);

    if (rawEpisodeId) {
      if (!entry.rawEpisodeIds.has(rawEpisodeId)) {
        entry.rawEpisodeIds.add(rawEpisodeId);
        this.totalEpisodeRecords++;
      }
    }
  }

  public ingestJsonData(data: unknown, fileNameLower: string) {
    if (!data) return;

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item === 'object') {
          this.ingestJsonObject(item as Record<string, unknown>, fileNameLower);
        }
      }
      return;
    }

    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      // Check if it has top-level arrays like shows, watched_episodes, seen_episodes, data, records
      for (const key of [
        'shows',
        'followed_shows',
        'tv_shows',
        'watched_episodes',
        'seen_episodes',
        'episodes',
        'records',
        'data',
        'items'
      ]) {
        if (Array.isArray(obj[key])) {
          this.ingestJsonData(obj[key], key);
        }
      }
    }
  }

  private ingestJsonObject(obj: Record<string, unknown>, contextName: string) {
    // Convert primitive fields to string map and also check nested seasons/episodes arrays
    const flatRow: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        flatRow[k.toLowerCase()] = String(v);
      }
    }
    this.ingestRow(flatRow, contextName);

    // Also handle nested episodes or seasons array inside a show JSON object (common in TV Time JSON exports)
    const showName =
      (obj.name as string) ||
      (obj.title as string) ||
      (obj.series_name as string) ||
      (obj.show_name as string);
    const tvdbId = Number(obj.id || obj.series_id || obj.tv_show_id || obj.thetvdb_id);

    if (Array.isArray(obj.episodes)) {
      for (const ep of obj.episodes) {
        if (ep && typeof ep === 'object') {
          const epObj = ep as Record<string, unknown>;
          const epRow: Record<string, string> = {
            series_name: showName || '',
            series_id: !isNaN(tvdbId) ? String(tvdbId) : '',
            season_number: String(epObj.season_number ?? epObj.season ?? ''),
            episode_number: String(epObj.episode_number ?? epObj.number ?? epObj.episode ?? ''),
            watched_at: String(epObj.watched_at ?? epObj.created_at ?? '')
          };
          this.ingestRow(epRow, 'episodes');
        }
      }
    }

    if (Array.isArray(obj.seasons)) {
      for (const s of obj.seasons) {
        if (s && typeof s === 'object') {
          const sObj = s as Record<string, unknown>;
          const sNum = sObj.season_number ?? sObj.number ?? sObj.season;
          if (Array.isArray(sObj.episodes)) {
            for (const ep of sObj.episodes) {
              if (ep && typeof ep === 'object') {
                const epObj = ep as Record<string, unknown>;
                if (epObj.watched === false || epObj.seen === false) continue;
                const epRow: Record<string, string> = {
                  series_name: showName || '',
                  series_id: !isNaN(tvdbId) ? String(tvdbId) : '',
                  season_number: String(sNum ?? epObj.season_number ?? ''),
                  episode_number: String(
                    epObj.episode_number ?? epObj.number ?? epObj.episode ?? ''
                  )
                };
                this.ingestRow(epRow, 'episodes');
              }
            }
          }
        }
      }
    }
  }

  public getResults(filesProcessed: string[]): TVTimeParseResult {
    const shows = Array.from(this.map.values()).sort((a, b) => {
      const aCount = a.episodes.length || a.rawEpisodeIds.size;
      const bCount = b.episodes.length || b.rawEpisodeIds.size;
      return bCount - aCount;
    });

    return {
      shows,
      filesProcessed,
      totalEpisodeRecords: this.totalEpisodeRecords
    };
  }
}

export async function parseTVTimeFiles(files: FileList | File[]): Promise<TVTimeParseResult> {
  const aggregator = new TVTimeAggregator();
  const filesProcessed: string[] = [];
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((z) => !z.dir);

      // Process show-level files first so show names attach to series_id before episode files
      entries.sort((a, b) => {
        const aShow = a.name.toLowerCase().includes('show') ? 0 : 1;
        const bShow = b.name.toLowerCase().includes('show') ? 0 : 1;
        return aShow - bShow;
      });

      for (const entry of entries) {
        const entryLower = entry.name.toLowerCase();
        if (entryLower.endsWith('.csv')) {
          const text = await entry.async('string');
          const rows = parseCsvRows(text);
          for (const row of rows) {
            aggregator.ingestRow(row, entryLower);
          }
          filesProcessed.push(entry.name.split('/').pop() || entry.name);
        } else if (entryLower.endsWith('.json')) {
          try {
            const text = await entry.async('string');
            const json = JSON.parse(text);
            aggregator.ingestJsonData(json, entryLower);
            filesProcessed.push(entry.name.split('/').pop() || entry.name);
          } catch {
            // Skip invalid JSON file
          }
        }
      }
    } else if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt') || lowerName.endsWith('.tsv')) {
      const text = await file.text();
      const rows = parseCsvRows(text);
      for (const row of rows) {
        aggregator.ingestRow(row, lowerName);
      }
      filesProcessed.push(file.name);
    } else if (lowerName.endsWith('.json')) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        aggregator.ingestJsonData(json, lowerName);
        filesProcessed.push(file.name);
      } catch {
        // Ignore invalid JSON
      }
    }
  }

  return aggregator.getResults(filesProcessed);
}

// Parse free-form text list (e.g. "Severance S01E09", "The Bear S02E10", or just "Stranger Things (all)")
export function parseTextListShows(text: string): TVTimeParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const shows: ParsedTVTimeShow[] = [];
  let totalEpisodeRecords = 0;

  for (const line of lines) {
    // Check if line contains SxxExx or 1x05
    const codeMatch = line.match(/^(.*?)\s*[-–—:|]?\s*(?:S(\d{1,2})\s*E(\d{1,3})|(\d{1,2})x(\d{1,3}))/i);
    if (codeMatch) {
      const showName = codeMatch[1].trim();
      const season = Number(codeMatch[2] ?? codeMatch[4]);
      const episode = Number(codeMatch[3] ?? codeMatch[5]);
      if (showName && season > 0 && episode > 0) {
        shows.push({
          key: `text:${showName.toLowerCase()}`,
          showName,
          episodes: [],
          rawEpisodeIds: new Set(),
          upToSeason: season,
          upToEpisode: episode
        });
        totalEpisodeRecords += episode;
        continue;
      }
    }

    // Check if line says "Season X" (e.g. "Severance Season 1")
    const seasonMatch = line.match(/^(.*?)\s*[-–—:|]?\s*Season\s+(\d{1,2})/i);
    if (seasonMatch) {
      const showName = seasonMatch[1].trim();
      const season = Number(seasonMatch[2]);
      if (showName && season > 0) {
        shows.push({
          key: `text:${showName.toLowerCase()}`,
          showName,
          episodes: [],
          rawEpisodeIds: new Set(),
          upToSeason: season,
          upToEpisode: 999
        });
        continue;
      }
    }

    // Plain show name -> mark all aired episodes watched by default (or user can toggle in review)
    const cleanedName = line.replace(/^[-*•\d.)+\s]+/, '').trim();
    if (cleanedName) {
      shows.push({
        key: `text:${cleanedName.toLowerCase()}`,
        showName: cleanedName,
        episodes: [],
        rawEpisodeIds: new Set(),
        markAllAired: true
      });
    }
  }

  return {
    shows,
    filesProcessed: ['Text List'],
    totalEpisodeRecords
  };
}

export interface ImportProgressUpdate {
  current: number;
  total: number;
  currentLabel: string;
  importedCount: number;
  skippedLabels: string[];
}

export async function executeTVTimeImport(
  parsedShows: ParsedTVTimeShow[],
  existingShows: TrackedShow[],
  existingActivity: WatchActivityItem[],
  onProgress: (update: ImportProgressUpdate) => void
): Promise<{
  mergedShows: TrackedShow[];
  mergedActivity: WatchActivityItem[];
  importedCount: number;
  skippedLabels: string[];
}> {
  const showMap = new Map<number, TrackedShow>();
  for (const s of existingShows) {
    showMap.set(s.id, s);
  }

  const newActivityItems: WatchActivityItem[] = [];
  const skippedLabels: string[] = [];
  let importedCount = 0;
  const now = new Date();

  for (let i = 0; i < parsedShows.length; i++) {
    const item = parsedShows[i];
    const displayLabel =
      item.showName || (item.tvdbId ? `TVDB #${item.tvdbId}` : `Show #${i + 1}`);

    onProgress({
      current: i + 1,
      total: parsedShows.length,
      currentLabel: displayLabel,
      importedCount,
      skippedLabels
    });

    try {
      const rawShow = await resolveShowFromTVTime({
        tvdbId: item.tvdbId,
        imdbId: item.imdbId,
        showName: item.showName
      });

      if (!rawShow) {
        skippedLabels.push(displayLabel);
        continue;
      }

      const existing = showMap.get(rawShow.id);
      const manualStatus =
        item.isWatchLater && item.episodes.length === 0 && item.rawEpisodeIds.size === 0
          ? 'watch_later'
          : 'auto';

      const tracked = mapRawShowToTracked(rawShow, existing, manualStatus);
      const watchedSet = new Set<number>(tracked.watchedEpisodeIds);
      const sortedEps = sortEpisodes(tracked.episodes);
      const airedEps = sortedEps.filter((ep) => isEpisodeAired(ep, now));

      if (item.markAllAired) {
        for (const ep of airedEps) {
          watchedSet.add(ep.id);
        }
      } else if (item.upToSeason !== undefined && item.upToEpisode !== undefined) {
        for (const ep of sortedEps) {
          const isUpTo =
            ep.season < item.upToSeason ||
            (ep.season === item.upToSeason && (ep.number ?? 0) <= item.upToEpisode);
          if (isUpTo && isEpisodeAired(ep, now)) {
            watchedSet.add(ep.id);
          }
        }
      } else if (item.episodes.length > 0) {
        // Match exact (season, episode) pairs from TV Time export
        const epLookup = new Map<string, number>();
        for (const ep of sortedEps) {
          epLookup.set(`${ep.season}:${ep.number}`, ep.id);
        }

        for (const ref of item.episodes) {
          const matchedId = epLookup.get(`${ref.season}:${ref.episode}`);
          if (matchedId !== undefined) {
            watchedSet.add(matchedId);
            const fullEp = sortedEps.find((e) => e.id === matchedId);
            if (fullEp && ref.watchedAt && newActivityItems.length < 100) {
              newActivityItems.push({
                id: `${tracked.id}-${fullEp.id}-${ref.watchedAt}`,
                showId: tracked.id,
                showName: tracked.name,
                showImage: tracked.image?.medium || null,
                episodeId: fullEp.id,
                episodeTitle: fullEp.name,
                season: fullEp.season,
                number: fullEp.number,
                timestamp: ref.watchedAt
              });
            }
          }
        }
      } else if (item.rawEpisodeIds.size > 0) {
        // Export had raw episode_id count per series_id without season/episode columns
        const count = Math.min(item.rawEpisodeIds.size, airedEps.length);
        for (let k = 0; k < count; k++) {
          watchedSet.add(airedEps[k].id);
        }
      } else if (item.isArchived) {
        // Archived show in followed_tv_show.csv with no separate episode rows -> mark aired watched
        for (const ep of airedEps) {
          watchedSet.add(ep.id);
        }
      }

      tracked.watchedEpisodeIds = Array.from(watchedSet);
      if (item.lastWatchedAt) {
        tracked.lastWatchedAt = Math.max(tracked.lastWatchedAt || 0, item.lastWatchedAt);
      } else if (tracked.watchedEpisodeIds.length > 0 && !tracked.lastWatchedAt) {
        tracked.lastWatchedAt = Date.now();
      }

      showMap.set(tracked.id, tracked);
      importedCount++;

      // Small polite delay when importing many shows to avoid hitting TVMaze rate limit bursts
      if (parsedShows.length > 8) {
        await new Promise((r) => setTimeout(r, 220));
      }
    } catch {
      skippedLabels.push(displayLabel);
    }
  }

  const mergedShows = Array.from(showMap.values()).sort((a, b) => {
    const aTime = a.lastWatchedAt || a.addedAt;
    const bTime = b.lastWatchedAt || b.addedAt;
    return bTime - aTime;
  });

  const combinedActivity = [...newActivityItems, ...existingActivity]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 150);

  return {
    mergedShows,
    mergedActivity: combinedActivity,
    importedCount,
    skippedLabels
  };
}
