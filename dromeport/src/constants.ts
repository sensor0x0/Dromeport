import type { AppConfig } from "./types";

export const API = "";

export const DEFAULT_CONFIG: AppConfig = {
  libraryPath: "",
  playlistMode: "flat",
  spotify: {
    spotiflacService: "tidal",
    spotiflacLoop: 0,
    spotiflacArtistSubfolders: false,
    spotiflacAlbumSubfolders: true,
    spotiflacFilenameFormat: "{track_number} {title} - {artist}",
    spotiflacOutputFormat: "flac",
    embedMetadata: true,
    enrichMetadata: true,
    lastfmApiKey: "",
  },
  ytMusic: { quality: "opus", embedMetadata: true, enrichMetadata: true },
};
