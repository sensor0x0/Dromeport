import { useState, useEffect, useRef } from "react";
import { SiSpotify, SiYoutubemusic } from "react-icons/si";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScheduleForm, type ScheduleFormProps } from "./ScheduleForm";
import { SearchDropdown } from "./SearchDropdown";
import type { SearchResult } from "./SearchDropdown";
import type { AppConfig, SyncPlaylist, Provider } from "@/types";
import { API } from "@/constants";
import { looksLikeUrl } from "@/utils";

export interface AddSyncModalProps {
  config: AppConfig;
  onConfirm: (
    data: Omit<
      SyncPlaylist,
      | "id"
      | "last_synced_at"
      | "last_sync_status"
      | "last_sync_log"
      | "next_run_at"
    > & { config: AppConfig },
  ) => void;
  onCancel: () => void;
}

export function AddSyncModal({ config, onConfirm, onCancel }: AddSyncModalProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("Spotify");
  const [playlistFolder, setPlaylistFolder] = useState("");
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">(
    "interval",
  );
  const [intervalValue, setIntervalValue] = useState(24);
  const [intervalUnit, setIntervalUnit] = useState<
    "minutes" | "hours" | "days"
  >("hours");
  const [cronTime, setCronTime] = useState("08:00");
  const [cronDays, setCronDays] = useState("daily");
  const [enabled, setEnabled] = useState(true);

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Focus URL input on mount
  const urlRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    urlRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (!url.trim() || looksLikeUrl(url)) {
      setShowSearch(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setShowSearch(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          query: url.trim(),
          provider,
        });
        const res = await fetch(`${API}/api/search?${params.toString()}`);
        const data = (await res.json()) as { results: SearchResult[] };
        setSearchResults(data.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      setIsSearching(false);
    };
  }, [url, provider]);

  // Close search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSearch(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearchSelect = (result: SearchResult) => {
    setUrl(result.url);
    // Auto-fill name from search result if name is still empty
    if (!name.trim()) {
      setName(result.title);
    }
    setShowSearch(false);
    setSearchResults([]);
  };

  const handleScheduleChange = (
    updates: Parameters<ScheduleFormProps["onChange"]>[0],
  ) => {
    if (updates.scheduleType !== undefined)
      setScheduleType(updates.scheduleType);
    if (updates.intervalValue !== undefined)
      setIntervalValue(updates.intervalValue);
    if (updates.intervalUnit !== undefined)
      setIntervalUnit(updates.intervalUnit);
    if (updates.cronTime !== undefined) setCronTime(updates.cronTime);
    if (updates.cronDays !== undefined) setCronDays(updates.cronDays);
  };

  const canSubmit = url.trim() && name.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      url: url.trim(),
      name: name.trim(),
      thumb: null,
      provider,
      config: {
        ...config,
        playlistMode: "folder",
        spotify: {
          ...config.spotify,
          spotiflacArtistSubfolders: false,
          spotiflacAlbumSubfolders: false,
        },
      },
      playlist_folder: playlistFolder.trim() || name.trim(),
      schedule_type: scheduleType,
      interval_value: intervalValue,
      interval_unit: intervalUnit,
      cron_time: cronTime,
      cron_days: cronDays,
      enabled,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-4">Watch a playlist</h2>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">URL</Label>
            <div className="flex gap-2">
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as Provider)}
              >
                <SelectTrigger className="bg-background w-44 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Spotify">
                    <span className="flex items-center gap-2">
                      <SiSpotify className="w-3.5 h-3.5 text-[#1DB954]" />{" "}
                      Spotify
                    </span>
                  </SelectItem>
                  <SelectItem value="YouTube Music">
                    <span className="flex items-center gap-2">
                      <SiYoutubemusic className="w-3.5 h-3.5 text-[#FF0000]" />{" "}
                      YouTube Music
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Search-aware URL input */}
              <div className="relative flex-1" ref={searchContainerRef}>
                <Input
                  ref={urlRef}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Search or paste playlist link..."
                  className="bg-background font-mono text-sm w-full"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowSearch(false);
                  }}
                  onFocus={() => {
                    if (url.trim() && !looksLikeUrl(url)) {
                      setShowSearch(true);
                    }
                  }}
                />
                {showSearch && (
                  <SearchDropdown
                    results={searchResults}
                    isLoading={isSearching}
                    query={url}
                    provider={provider}
                    onSelect={handleSearchSelect}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chill Mix"
              className="bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              Folder Name
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (optional, defaults to name)
              </span>
            </Label>
            <Input
              value={playlistFolder}
              onChange={(e) => setPlaylistFolder(e.target.value)}
              placeholder={name || "Chill Mix"}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Tracks will be saved to{" "}
              <code className="font-mono bg-muted px-1 rounded">
                {config.libraryPath || "/music"}/
                {playlistFolder || name || "Chill Mix"}/
              </code>
            </p>
          </div>

          <Separator className="bg-border/50" />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Schedule</Label>
            <ScheduleForm
              scheduleType={scheduleType}
              intervalValue={intervalValue}
              intervalUnit={intervalUnit}
              cronTime={cronTime}
              cronDays={cronDays}
              onChange={handleScheduleChange}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
            <div className="space-y-0.5 pr-4">
              <Label className="text-sm">Enable immediately</Label>
              <p className="text-xs text-muted-foreground">
                Start scheduling right after adding
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            Watch playlist
          </Button>
        </div>
      </div>
    </div>
  );
}