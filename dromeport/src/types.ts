export type Provider = "Spotify" | "YouTube Music";
export type DownloadStatus = "downloading" | "done" | "error" | "cancelled";

export interface DockerLibrary {
  path: string;
  defaultName: string;
}

export interface ServerConfig {
  libraries: DockerLibrary[];
}

export interface ToolVersions {
  ytdlp: string;
  spotiflac: string;
  ytmusicapi: string;
}

export interface QueueItem {
  id: string;
  url: string;
  libraryPath: string;
  provider: Provider;
  title: string;
  thumb: string | null;
  status: DownloadStatus;
  current: number;
  total: number;
  startedAt: number;
  finishedAt: number | null;
  errors: number;
  logs: string;
  logsOpen: boolean;
}

export interface AppConfig {
  libraryPath: string;
  playlistMode: "flat" | "folder";
  spotify: {
    spotiflacService: string;
    spotiflacLoop: number;
    spotiflacArtistSubfolders: boolean;
    spotiflacAlbumSubfolders: boolean;
    spotiflacFilenameFormat: string;
    spotiflacOutputFormat: string;
    embedMetadata: boolean;
    enrichMetadata: boolean;
    lastfmApiKey: string;
  };
  ytMusic: {
    quality: string;
    embedMetadata: boolean;
    enrichMetadata: boolean;
  };
}

export interface SyncPlaylist {
  id: string;
  url: string;
  name: string;
  thumb: string | null;
  provider: Provider;
  config: AppConfig;
  playlist_folder: string;
  schedule_type: "interval" | "cron";
  interval_value: number;
  interval_unit: "minutes" | "hours" | "days";
  cron_time: string;
  cron_days: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: "success" | "error" | null;
  last_sync_log: string | null;
  next_run_at: string | null;
}