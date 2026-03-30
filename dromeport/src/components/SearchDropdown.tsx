import { SiSpotify, SiYoutubemusic } from "react-icons/si";
import type { Provider } from "@/types";

export interface SearchResult {
  title: string;
  artist: string;
  url: string;
  thumbnail?: string;
  type: "track" | "playlist" | "album";
}

interface SearchDropdownProps {
  results: SearchResult[];
  isLoading: boolean;
  query: string;
  provider: Provider;
  onSelect: (result: SearchResult) => void;
}

const TYPE_LABELS: Record<SearchResult["type"], string> = {
  track: "Track",
  playlist: "Playlist",
  album: "Album",
};

export function SearchDropdown({
  results,
  isLoading,
  query,
  provider,
  onSelect,
}: SearchDropdownProps) {
  const ProviderIcon =
    provider === "Spotify" ? SiSpotify : SiYoutubemusic;
  const iconColor =
    provider === "Spotify" ? "text-[#1DB954]" : "text-[#FF0000]";

  return (
    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
      {isLoading ? (
        <div className="py-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 px-3 py-2 animate-pulse"
            >
              <div className="w-8 h-8 rounded bg-muted shrink-0" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2.5 bg-muted rounded w-1/2" />
              </div>
              <div className="h-4 w-10 bg-muted rounded shrink-0" />
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="px-3 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            No results for &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : (
        <div className="py-1 max-h-72 overflow-y-auto">
          {results.map((result, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(result)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-left transition-colors"
            >
              <div className="w-8 h-8 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                {result.thumbnail ? (
                  <img
                    src={result.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <ProviderIcon className={`w-4 h-4 ${iconColor}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-tight">
                  {result.title}
                </p>
                {result.artist && (
                  <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                    {result.artist}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                {TYPE_LABELS[result.type]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}