export interface TVMazeImage {
  medium: string;
  original: string;
}

export interface TVMazeEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  type?: string;
  airdate: string; // YYYY-MM-DD
  airtime: string; // HH:mm
  airstamp: string | null; // ISO-8601 timestamp
  runtime: number | null;
  rating?: {
    average: number | null;
  };
  image: TVMazeImage | null;
  summary: string | null;
}

export interface TVMazeRawShow {
  id: number;
  name: string;
  type?: string;
  language?: string;
  genres: string[];
  status: string; // 'Running' | 'Ended' | 'To Be Determined' | 'In Development'
  runtime: number | null;
  averageRuntime: number | null;
  premiered: string | null;
  ended: string | null;
  officialSite: string | null;
  schedule: {
    time: string;
    days: string[];
  };
  rating: {
    average: number | null;
  };
  network: {
    id: number;
    name: string;
    country?: {
      name: string;
      code: string;
    };
  } | null;
  webChannel: {
    id: number;
    name: string;
  } | null;
  image: TVMazeImage | null;
  summary: string | null;
  _embedded?: {
    episodes?: TVMazeEpisode[];
  };
}

export type ManualWatchStatus = 'auto' | 'watch_later' | 'stopped';

export type WatchlistTab = 'watching' | 'upcoming' | 'watch_later' | 'completed' | 'all';

export interface TrackedShow {
  id: number;
  name: string;
  image: TVMazeImage | null;
  status: string; // 'Running', 'Ended', etc.
  premiered: string | null;
  ended: string | null;
  networkName: string | null;
  officialSite: string | null;
  schedule: {
    time: string;
    days: string[];
  };
  averageRuntime: number;
  genres: string[];
  summary: string | null;
  rating: number | null;
  manualStatus: ManualWatchStatus;
  watchedEpisodeIds: number[];
  episodes: TVMazeEpisode[];
  userRating?: number; // 1-5 stars
  userNotes?: string;
  favorite?: boolean;
  addedAt: number;
  lastUpdated: number;
  lastWatchedAt?: number;
}

export interface WatchActivityItem {
  id: string;
  showId: number;
  showName: string;
  showImage: string | null;
  episodeId: number;
  episodeTitle: string;
  season: number;
  number: number;
  timestamp: number;
}
