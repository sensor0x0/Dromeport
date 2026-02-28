import { useState, useEffect, useRef, useCallback } from "react";
import { SiSpotify, SiYoutubemusic, SiGithub } from "react-icons/si";
import {
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Pencil,
  Check,
  Info,
  RefreshCw,
  Package,
  Plus,
  Play,
  Trash2,
  Timer,
  Calendar,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";

const API = "";

// Types

type Provider = "Spotify" | "YouTube Music";
type DownloadStatus = "downloading" | "done" | "error" | "cancelled";

interface DockerLibrary {
  path: string;
  defaultName: string;
}

interface ServerConfig {
  libraries: DockerLibrary[];
}

interface ToolVersions {
  ytdlp: string;
  spotiflac: string;
}

interface QueueItem {
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

interface AppConfig {
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

interface SyncPlaylist {
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

const DEFAULT_CONFIG: AppConfig = {
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

// Helpers

function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p);
}

function isPlaylistUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    /spotify\.com\/(playlist|album)\//.test(u) ||
    (u.includes("list=") && !u.includes("watch?v=")) ||
    u.includes("/playlist?") ||
    (/youtube/.test(u) && u.includes("/album/"))
  );
}

function formatTime(seconds: number): string {
  if (seconds < 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatRelativeTime(isoString: string | null, now: number): string {
  if (!isoString) return "Never";
  const diff = now - new Date(isoString + "Z").getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimeUntil(isoString: string | null, now: number): string {
  if (!isoString) return "Not scheduled";
  const diff = new Date(isoString).getTime() - now;
  if (diff <= 0) return "Soon";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Less than a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function describeSchedule(p: SyncPlaylist): string {
  if (p.schedule_type === "interval") {
    const unit =
      p.interval_value === 1 ? p.interval_unit.slice(0, -1) : p.interval_unit;
    return `Every ${p.interval_value} ${unit}`;
  }
  const dayLabel: Record<string, string> = {
    daily: "Daily",
    weekdays: "Weekdays",
    weekends: "Weekends",
    mon: "Mondays",
    tue: "Tuesdays",
    wed: "Wednesdays",
    thu: "Thursdays",
    fri: "Fridays",
    sat: "Saturdays",
    sun: "Sundays",
  };
  const days = dayLabel[p.cron_days] ?? p.cron_days;
  return `${days} at ${p.cron_time}`;
}

// Queue card

interface QueueCardProps {
  item: QueueItem;
  now: number;
  onCancel: (item: QueueItem) => void;
  onToggleLogs: (id: string) => void;
}

function QueueCard({
  item,
  now,
  onCancel,
  onToggleLogs,
}: QueueCardProps) {
  const logsRef = useRef<HTMLTextAreaElement>(null);
  const isActive = item.status === "downloading";
  const elapsed = Math.floor(
    ((item.finishedAt ?? now) - item.startedAt) / 1000,
  );
  const rate = elapsed > 5 && item.current > 0 ? item.current / elapsed : 0;
  const eta =
    rate > 0 && item.total > item.current
      ? Math.floor((item.total - item.current) / rate)
      : null;
  const progress = item.total > 0 ? (item.current / item.total) * 100 : null;
  const accentColor =
    item.provider === "Spotify" ? "border-l-[#1DB954]" : "border-l-[#FF0000]";

  useEffect(() => {
    if (logsRef.current && item.logsOpen)
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [item.logs, item.logsOpen]);

  const renderStatusIcon = () => {
    switch (item.status) {
      case "downloading":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Downloading
          </span>
        );
      case "done":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
            <CheckCircle className="w-3 h-3" /> Done
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> Error
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            <X className="w-3 h-3" /> Cancelled
          </span>
        );
    }
  };

  return (
    <div
      className={`rounded-lg border border-border border-l-4 ${accentColor} bg-card/60 overflow-hidden transition-all duration-200`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
            {item.thumb ? (
              <img
                src={item.thumb}
                className="w-full h-full object-cover"
                alt=""
              />
            ) : item.provider === "Spotify" ? (
              <SiSpotify className="w-6 h-6 text-[#1DB954]" />
            ) : (
              <SiYoutubemusic className="w-6 h-6 text-[#FF0000]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate leading-tight">
              {item.title === "Loading..." ? (
                <span className="text-muted-foreground italic">Loading...</span>
              ) : (
                item.title
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.provider}
            </p>
          </div>
          <div className="flex-shrink-0">
            {renderStatusIcon()}
          </div>
        </div>

        {progress !== null && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {item.current} / {item.total} tracks
                {item.errors > 0 && (
                  <span className="ml-2 text-yellow-500 inline-flex items-center gap-0.5">
                    <AlertTriangle className="w-3 h-3" /> {item.errors} failed
                  </span>
                )}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  item.status === "done"
                    ? "bg-green-500"
                    : item.status === "error"
                      ? "bg-red-500"
                      : item.status === "cancelled"
                        ? "bg-muted-foreground"
                        : "bg-primary"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {progress === null && isActive && (
          <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-primary rounded-full animate-[slide_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{formatTime(elapsed)}</span>
            {isActive && eta !== null && (
              <span className="ml-1">· ETA ~{formatTime(eta)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <button
                onClick={() => onCancel(item)}
                className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 px-2 py-1 rounded-md transition-colors"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            )}
            <button
              onClick={() => onToggleLogs(item.id)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
            >
              Logs
              {item.logsOpen ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>
      </div>

      {item.logsOpen && (
        <textarea
          ref={logsRef}
          readOnly
          value={item.logs}
          className="w-full h-48 p-3 bg-black/95 text-green-400 font-mono text-xs border-t border-border/50 resize-none focus:outline-none block"
        />
      )}
    </div>
  );
}

// Playlist modal

interface PlaylistModalProps {
  url: string;
  provider: Provider;
  onConfirm: (folderName: string) => void;
  onCancel: () => void;
}

function PlaylistModal({
  url,
  provider,
  onConfirm,
  onCancel,
}: PlaylistModalProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 mb-1">
          {provider === "Spotify" ? (
            <SiSpotify className="w-4 h-4 text-[#1DB954]" />
          ) : (
            <SiYoutubemusic className="w-4 h-4 text-[#FF0000]" />
          )}
          <h2 className="text-base font-semibold">Name this playlist folder</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          You have <strong>Playlist Folder</strong> mode enabled. Enter the
          folder name for this download.
        </p>
        <p className="text-xs text-muted-foreground font-mono truncate mb-4 bg-muted/50 px-2 py-1 rounded">
          {url.length > 60 ? url.slice(0, 57) + "…" : url}
        </p>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. My epic playlist"
          className="mb-4"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(name.trim())}
            disabled={!name.trim()}
          >
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}

// Library row

interface LibraryRowProps {
  library: DockerLibrary;
  displayName: string;
  onRename: (path: string, name: string) => void;
}

function LibraryRow({ library, displayName, onRename }: LibraryRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onRename(library.path, trimmed);
    else setDraft(displayName);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5">
      <code className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded shrink-0 max-w-[45%] truncate">
        {library.path}
      </code>
      <span className="text-muted-foreground text-xs shrink-0">→</span>
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        {editing ? (
          <>
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(displayName);
                  setEditing(false);
                }
              }}
              onBlur={commit}
              className="h-7 text-sm py-0 px-2 bg-background"
            />
            <button
              onClick={commit}
              className="shrink-0 text-green-500 hover:text-green-400 transition-colors"
              title="Save"
            >
              <Check className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium truncate">{displayName}</span>
            <button
              onClick={() => {
                setDraft(displayName);
                setEditing(true);
              }}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="Rename"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Update tools card

interface ToolsCardProps {
  versions: ToolVersions | null;
  onRefreshVersions: () => void;
}

function ToolsCard({ versions, onRefreshVersions }: ToolsCardProps) {
  const [updating, setUpdating] = useState(false);
  const [log, setLog] = useState("");
  const [done, setDone] = useState(false);
  const logRef = useRef<HTMLTextAreaElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const startUpdate = () => {
    if (updating) return;
    setUpdating(true);
    setDone(false);
    setLog("");

    const es = new EventSource(`${API}/api/tools/update`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      if (e.data === "[DONE]") {
        es.close();
        esRef.current = null;
        setUpdating(false);
        setDone(true);
        onRefreshVersions();
        return;
      }
      setLog((prev) => prev + (e.data === "" ? "\n" : "\n" + e.data));
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setUpdating(false);
    };
  };

  return (
    <Card className="w-full bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-lg">Bundled Tools</CardTitle>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={startUpdate}
            disabled={updating}
            className="gap-1.5"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${updating ? "animate-spin" : ""}`}
            />
            {updating ? "Updating…" : "Update All"}
          </Button>
        </div>
        <CardDescription>
          yt-dlp and SpotiFLAC are installed as pip packages. Use Update All to
          upgrade them in place without restarting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Version table */}
        <div className="rounded-lg border border-border divide-y divide-border">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <SiYoutubemusic className="w-4 h-4 text-[#FF0000]" />
              <span className="text-sm font-medium">yt-dlp</span>
            </div>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {versions ? versions.ytdlp : "…"}
            </code>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <SiSpotify className="w-4 h-4 text-[#1DB954]" />
              <span className="text-sm font-medium">SpotiFLAC</span>
            </div>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {versions ? versions.spotiflac : "…"}
            </code>
          </div>
        </div>

        {/* Update log */}
        {(updating || done || log) && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Update log
              </span>
              {done && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Complete
                </span>
              )}
            </div>
            <textarea
              ref={logRef}
              readOnly
              value={log}
              placeholder="Update output will appear here…"
              className="w-full h-40 p-3 bg-black/95 text-green-400 font-mono text-xs rounded-md border border-border/50 resize-none focus:outline-none"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Schedule form - shared between add and edit modals

interface ScheduleFormProps {
  scheduleType: "interval" | "cron";
  intervalValue: number;
  intervalUnit: "minutes" | "hours" | "days";
  cronTime: string;
  cronDays: string;
  onChange: (
    updates: Partial<{
      scheduleType: "interval" | "cron";
      intervalValue: number;
      intervalUnit: "minutes" | "hours" | "days";
      cronTime: string;
      cronDays: string;
    }>,
  ) => void;
}

function ScheduleForm({
  scheduleType,
  intervalValue,
  intervalUnit,
  cronTime,
  cronDays,
  onChange,
}: ScheduleFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ scheduleType: "interval" })}
          className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
            scheduleType === "interval"
              ? "border-primary bg-primary/5"
              : "border-border bg-background/50 hover:bg-accent/50"
          }`}
        >
          <Timer className="w-4 h-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Every X time</p>
            <p className="text-xs text-muted-foreground">e.g. every 6 hours</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange({ scheduleType: "cron" })}
          className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
            scheduleType === "cron"
              ? "border-primary bg-primary/5"
              : "border-border bg-background/50 hover:bg-accent/50"
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Specific time</p>
            <p className="text-xs text-muted-foreground">e.g. daily at 08:00</p>
          </div>
        </button>
      </div>

      {scheduleType === "interval" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">Every</span>
          <Input
            type="number"
            min={1}
            value={intervalValue}
            onChange={(e) =>
              onChange({
                intervalValue: Math.max(1, parseInt(e.target.value) || 1),
              })
            }
            className="bg-background w-20"
          />
          <Select
            value={intervalUnit}
            onValueChange={(v) =>
              onChange({ intervalUnit: v as "minutes" | "hours" | "days" })
            }
          >
            <SelectTrigger className="bg-background w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">minutes</SelectItem>
              <SelectItem value="hours">hours</SelectItem>
              <SelectItem value="days">days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {scheduleType === "cron" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={cronDays}
            onValueChange={(v) => onChange({ cronDays: v })}
          >
            <SelectTrigger className="bg-background w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Every day</SelectItem>
              <SelectItem value="weekdays">Weekdays</SelectItem>
              <SelectItem value="weekends">Weekends</SelectItem>
              <SelectItem value="mon">Mondays</SelectItem>
              <SelectItem value="tue">Tuesdays</SelectItem>
              <SelectItem value="wed">Wednesdays</SelectItem>
              <SelectItem value="thu">Thursdays</SelectItem>
              <SelectItem value="fri">Fridays</SelectItem>
              <SelectItem value="sat">Saturdays</SelectItem>
              <SelectItem value="sun">Sundays</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground shrink-0">at</span>
          <Input
            type="time"
            value={cronTime}
            onChange={(e) => onChange({ cronTime: e.target.value })}
            className="bg-background w-32"
          />
        </div>
      )}
    </div>
  );
}

// Add sync playlist modal

interface AddSyncModalProps {
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

function AddSyncModal({ config, onConfirm, onCancel }: AddSyncModalProps) {
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

  const urlRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    urlRef.current?.focus();
  }, []);

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
      // Snapshot the current config so scheduled runs use the right settings
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
          {/* Provider and URL */}
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
              <Input
                ref={urlRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste playlist link..."
                className="bg-background font-mono text-sm flex-1"
              />
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chill Mix"
              className="bg-background"
            />
          </div>

          {/* Playlist folder */}
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

          {/* Schedule */}
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

          {/* Enabled */}
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

// Edit schedule modal

interface EditScheduleModalProps {
  playlist: SyncPlaylist;
  onConfirm: (updates: Partial<SyncPlaylist>) => void;
  onCancel: () => void;
}

function EditScheduleModal({
  playlist,
  onConfirm,
  onCancel,
}: EditScheduleModalProps) {
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">(
    playlist.schedule_type,
  );
  const [intervalValue, setIntervalValue] = useState(playlist.interval_value);
  const [intervalUnit, setIntervalUnit] = useState<
    "minutes" | "hours" | "days"
  >(playlist.interval_unit);
  const [cronTime, setCronTime] = useState(playlist.cron_time);
  const [cronDays, setCronDays] = useState(playlist.cron_days);
  const [enabled, setEnabled] = useState(playlist.enabled);

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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 mb-4">
          {playlist.provider === "Spotify" ? (
            <SiSpotify className="w-4 h-4 text-[#1DB954]" />
          ) : (
            <SiYoutubemusic className="w-4 h-4 text-[#FF0000]" />
          )}
          <h2 className="text-base font-semibold truncate">{playlist.name}</h2>
        </div>

        <div className="space-y-4">
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
              <Label className="text-sm">Enabled</Label>
              <p className="text-xs text-muted-foreground">
                Pause without deleting
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onConfirm({
                schedule_type: scheduleType,
                interval_value: intervalValue,
                interval_unit: intervalUnit,
                cron_time: cronTime,
                cron_days: cronDays,
                enabled,
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// Sync playlist card

interface SyncPlaylistCardProps {
  playlist: SyncPlaylist;
  now: number;
  onEdit: (playlist: SyncPlaylist) => void;
  onDelete: (id: string) => void;
}

function SyncPlaylistCard({
  playlist,
  now,
  onEdit,
  onDelete,
}: SyncPlaylistCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [log, setLog] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const [lastStatus, setLastStatus] = useState(playlist.last_sync_status);
  const [lastSyncedAt, setLastSyncedAt] = useState(playlist.last_synced_at);
  const logRef = useRef<HTMLTextAreaElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (logRef.current && logsOpen) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log, logsOpen]);

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    setLog("");
    setLogsOpen(true);
    // Clear status while running so we don't show stale OK/Error during the sync
    setLastStatus(null);

    const es = new EventSource(`${API}/api/sync/playlists/${playlist.id}/run`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      if (e.data === "[DONE]") {
        es.close();
        esRef.current = null;
        setSyncing(false);
        setLastSyncedAt(new Date().toISOString());
        // Fetch the real final status from the server once the run is done
        fetch(`${API}/api/sync/playlists`)
          .then((r) => r.json())
          .then((data: SyncPlaylist[]) => {
            const updated = data.find((p) => p.id === playlist.id);
            if (updated) setLastStatus(updated.last_sync_status);
          })
          .catch(() => {});
        return;
      }
      const line = e.data === "" ? "\n" : "\n" + e.data;
      setLog((prev) => prev + line);
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setSyncing(false);
    };
  };

  const accentColor =
    playlist.provider === "Spotify"
      ? "border-l-[#1DB954]"
      : "border-l-[#FF0000]";

  return (
    <div
      className={`rounded-lg border border-border border-l-4 ${accentColor} bg-card/60 overflow-hidden transition-all duration-200`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
            {playlist.thumb ? (
              <img
                src={playlist.thumb}
                className="w-full h-full object-cover"
                alt=""
              />
            ) : playlist.provider === "Spotify" ? (
              <SiSpotify className="w-6 h-6 text-[#1DB954]" />
            ) : (
              <SiYoutubemusic className="w-6 h-6 text-[#FF0000]" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate leading-tight">
                {playlist.name}
              </p>
              {!playlist.enabled && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                  Paused
                </span>
              )}
              {syncing && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />{" "}
                  Running...
                </span>
              )}
              {!syncing && lastStatus === "success" && (
                <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                  <CheckCircle className="w-3 h-3" /> OK
                </span>
              )}
              {!syncing && lastStatus === "error" && (
                <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full shrink-0">
                  <XCircle className="w-3 h-3" /> Error
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {describeSchedule(playlist)}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last synced: {formatRelativeTime(lastSyncedAt, now)}
              </span>
              {playlist.enabled && playlist.next_run_at && (
                <span className="flex items-center gap-1">
                  <RotateCw className="w-3 h-3" />
                  Next: {formatTimeUntil(playlist.next_run_at, now)}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Sync now"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {syncing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => onEdit(playlist)}
              title="Edit schedule"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(playlist.id)}
              title="Remove"
              className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLogsOpen((v) => !v)}
              title="Toggle log"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {logsOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {logsOpen && (
        <textarea
          ref={logRef}
          readOnly
          value={log || playlist.last_sync_log || ""}
          placeholder="No log yet."
          className="w-full h-48 p-3 bg-black/95 text-green-400 font-mono text-xs border-t border-border/50 resize-none focus:outline-none block"
        />
      )}
    </div>
  );
}

// Main app

function App() {
  const [activeTab, setActiveTab] = useState<"download" | "config" | "sync">(
    "download",
  );
  const [provider, setProvider] = useState<Provider>("YouTube Music");
  const [url, setUrl] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [pathError, setPathError] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [pendingDownload, setPendingDownload] = useState<{
    url: string;
    provider: Provider;
  } | null>(null);

  // Server-driven state
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [toolVersions, setToolVersions] = useState<ToolVersions | null>(null);

  // Sync state
  const [syncPlaylists, setSyncPlaylists] = useState<SyncPlaylist[]>([]);
  const [showAddSync, setShowAddSync] = useState(false);
  const [editingSync, setEditingSync] = useState<SyncPlaylist | null>(null);

  // Library display name overrides persisted in localStorage
  const [libraryNames, setLibraryNames] = useState<Record<string, string>>(
    () => {
      try {
        return JSON.parse(
          localStorage.getItem("dromeport-library-names") ?? "{}",
        ) as Record<string, string>;
      } catch {
        return {};
      }
    },
  );

  const eventSourceRef = useRef<EventSource | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const ActiveIcon = provider === "Spotify" ? SiSpotify : SiYoutubemusic;
  const dockerLibraries = serverConfig?.libraries ?? [];
  const isDockerMode = dockerLibraries.length > 0;

  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const saved = localStorage.getItem("dromeport-config");
      if (!saved) return DEFAULT_CONFIG;
      const parsed = JSON.parse(saved) as Partial<AppConfig>;
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        spotify: { ...DEFAULT_CONFIG.spotify, ...(parsed.spotify ?? {}) },
        ytMusic: { ...DEFAULT_CONFIG.ytMusic, ...(parsed.ytMusic ?? {}) },
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  // Effects

  // Fetch server config on mount
  useEffect(() => {
    fetch(`${API}/api/config`)
      .then((r) => r.json())
      .then((data: ServerConfig) => {
        setServerConfig(data);
        // Auto-select first library if no path set yet
        setConfig((prev) => {
          if (data.libraries.length > 0 && !prev.libraryPath) {
            return { ...prev, libraryPath: data.libraries[0].path };
          }
          return prev;
        });
      })
      .catch(() => {
        setServerConfig({ libraries: [] });
      });
  }, []);

  // Fetch tool versions whenever the config tab is opened (or on mount)
  const fetchVersions = useCallback(() => {
    fetch(`${API}/api/tools/versions`)
      .then((r) => r.json())
      .then((data: ToolVersions) => setToolVersions(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "config") fetchVersions();
  }, [activeTab, fetchVersions]);

  // Fetch sync playlists whenever the sync tab is opened
  const fetchSyncPlaylists = useCallback(() => {
    fetch(`${API}/api/sync/playlists`)
      .then((r) => r.json())
      .then((data: SyncPlaylist[]) => setSyncPlaylists(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "sync") fetchSyncPlaylists();
  }, [activeTab, fetchSyncPlaylists]);

  // Ticker for elapsed time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Persist config
  useEffect(() => {
    localStorage.setItem("dromeport-config", JSON.stringify(config));
  }, [config]);

  // Persist library name overrides
  useEffect(() => {
    localStorage.setItem(
      "dromeport-library-names",
      JSON.stringify(libraryNames),
    );
  }, [libraryNames]);

  useEffect(
    () => () => {
      eventSourceRef.current?.close();
    },
    [],
  );

  // Config helpers

  const setLibraryPath = (val: string) => {
    if (isAbsolutePath(val) || val === "") setPathError("");
    setConfig((prev) => ({ ...prev, libraryPath: val }));
  };

  const setPlaylistMode = (val: "flat" | "folder") =>
    setConfig((prev) => ({ ...prev, playlistMode: val }));

  const setYtMusic = (key: keyof AppConfig["ytMusic"], val: string | boolean) =>
    setConfig((prev) => ({
      ...prev,
      ytMusic: { ...prev.ytMusic, [key]: val },
    }));

  const setSpotify = (
    key: keyof AppConfig["spotify"],
    val: string | boolean | number,
  ) =>
    setConfig((prev) => ({
      ...prev,
      spotify: { ...prev.spotify, [key]: val },
    }));

  const renameLibrary = (path: string, name: string) =>
    setLibraryNames((prev) => ({ ...prev, [path]: name }));

  const getDisplayName = (lib: DockerLibrary) =>
    libraryNames[lib.path] ?? lib.defaultName;

  // Queue helpers

  const updateQueue = useCallback((id: string, updates: Partial<QueueItem>) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    );
  }, []);

  const toggleLogs = useCallback((id: string) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, logsOpen: !q.logsOpen } : q)),
    );
  }, []);

  const clearCompleted = () =>
    setQueue((prev) => prev.filter((q) => q.status === "downloading"));

  // Download logic

  const startDownload = useCallback(
    (dlUrl: string, dlProvider: Provider, playlistFolder: string) => {
      if (!config.libraryPath.trim() || !isAbsolutePath(config.libraryPath))
        return;

      eventSourceRef.current?.close();
      setIsDownloading(true);

      const tempId = `temp-${Date.now()}`;
      const newItem: QueueItem = {
        id: tempId,
        url: dlUrl,
        libraryPath: config.libraryPath,
        provider: dlProvider,
        title: "Loading...",
        thumb: null,
        status: "downloading",
        current: 0,
        total: 0,
        startedAt: Date.now(),
        finishedAt: null,
        errors: 0,
        logs: "",
        logsOpen: true,
      };
      setQueue((prev) => [newItem, ...prev]);
      activeJobIdRef.current = tempId;

      const params = new URLSearchParams({
        url: dlUrl,
        provider: dlProvider,
        config: JSON.stringify(config),
        ...(playlistFolder ? { playlist_folder: playlistFolder } : {}),
      });

      const es = new EventSource(
        `${API}/api/download/stream?${params.toString()}`,
      );
      eventSourceRef.current = es;

      es.addEventListener("meta", (e: MessageEvent<string>) => {
        try {
          const data = JSON.parse(e.data) as {
            type: string;
            value?: string;
            url?: string;
            current?: number;
            total?: number;
          };
          const currentId = activeJobIdRef.current!;
          switch (data.type) {
            case "job_id":
              if (data.value) {
                setQueue((prev) =>
                  prev.map((q) =>
                    q.id === currentId ? { ...q, id: data.value! } : q,
                  ),
                );
                activeJobIdRef.current = data.value;
              }
              break;
            case "title":
              if (data.value)
                updateQueue(activeJobIdRef.current!, { title: data.value });
              break;
            case "thumb":
              if (data.url)
                updateQueue(activeJobIdRef.current!, { thumb: data.url });
              break;
            case "progress":
              updateQueue(activeJobIdRef.current!, {
                current: data.current ?? 0,
                total: data.total ?? 0,
              });
              break;
          }
        } catch {
          /* ignore */
        }
      });

      es.addEventListener("status", (e: MessageEvent<string>) => {
        try {
          const data = JSON.parse(e.data) as { success: boolean };
          if (!data.success) {
            updateQueue(activeJobIdRef.current!, { status: "error" });
          }
        } catch {
          /* ignore */
        }
      });

      es.onmessage = (event: MessageEvent<string>) => {
        const currentId = activeJobIdRef.current!;
        if (event.data === "[DONE]") {
          es.close();
          eventSourceRef.current = null;
          setIsDownloading(false);
          setQueue((prev) =>
            prev.map((q) =>
              q.id === currentId
                ? {
                    ...q,
                    status: "done",
                    finishedAt: Date.now(),
                    logsOpen: false,
                  }
                : q,
            ),
          );
          return;
        }
        const line = event.data === "" ? "\n" : "\n" + event.data;
        const isError =
          event.data.startsWith("ERROR:") || event.data.includes("❌");
        setQueue((prev) =>
          prev.map((q) =>
            q.id === currentId
              ? {
                  ...q,
                  logs: q.logs + line,
                  errors: isError ? q.errors + 1 : q.errors,
                }
              : q,
          ),
        );
      };

      es.onerror = () => {
        const currentId = activeJobIdRef.current;
        if (es.readyState === EventSource.CLOSED) {
          setIsDownloading(false);
          if (currentId) {
            setQueue((prev) =>
              prev.map((q) =>
                q.id === currentId && q.status === "downloading"
                  ? {
                      ...q,
                      status: "error",
                      finishedAt: Date.now(),
                      logsOpen: true,
                    }
                  : q,
              ),
            );
          }
          eventSourceRef.current = null;
        }
      };
    },
    [config, updateQueue],
  );

  const handleDownload = () => {
    if (!url.trim()) return;
    if (!config.libraryPath.trim()) {
      setPathError("Path is required.");
      setActiveTab("config");
      return;
    }
    if (!isAbsolutePath(config.libraryPath)) {
      setPathError("Must be an absolute path.");
      setActiveTab("config");
      return;
    }
    if (config.playlistMode === "folder" && isPlaylistUrl(url.trim())) {
      setPendingDownload({ url: url.trim(), provider });
      return;
    }
    startDownload(url.trim(), provider, "");
  };

  const handleModalConfirm = (folderName: string) => {
    if (!pendingDownload) return;
    startDownload(pendingDownload.url, pendingDownload.provider, folderName);
    setPendingDownload(null);
  };

  const handleCancel = async (item: QueueItem) => {
    updateQueue(item.id, { status: "cancelled", finishedAt: Date.now() });
    setIsDownloading(false);
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    try {
      await fetch(
        `${API}/api/download/${encodeURIComponent(item.id)}?library_path=${encodeURIComponent(item.libraryPath)}`,
        { method: "DELETE" },
      );
    } catch {
      /* ignore */
    }
  };

  // Sync helpers

  const handleAddSync = async (
    data: Parameters<AddSyncModalProps["onConfirm"]>[0],
  ) => {
    try {
      const res = await fetch(`${API}/api/sync/playlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setShowAddSync(false);
        fetchSyncPlaylists();
      }
    } catch {
      /* ignore */
    }
  };

  const handleEditSync = async (updates: Partial<SyncPlaylist>) => {
    if (!editingSync) return;
    try {
      const res = await fetch(`${API}/api/sync/playlists/${editingSync.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setEditingSync(null);
        fetchSyncPlaylists();
      }
    } catch {
      /* ignore */
    }
  };

  const handleDeleteSync = async (id: string) => {
    try {
      await fetch(`${API}/api/sync/playlists/${id}`, { method: "DELETE" });
      setSyncPlaylists((prev) => prev.filter((p) => p.id !== id));
    } catch {
      /* ignore */
    }
  };

  const hasCompleted = queue.some((q) => q.status !== "downloading");

  // Render

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="relative min-h-screen bg-background text-foreground transition-colors duration-300 pb-16">
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

        {pendingDownload && (
          <PlaylistModal
            url={pendingDownload.url}
            provider={pendingDownload.provider}
            onConfirm={handleModalConfirm}
            onCancel={() => setPendingDownload(null)}
          />
        )}

        {showAddSync && (
          <AddSyncModal
            config={config}
            onConfirm={handleAddSync}
            onCancel={() => setShowAddSync(false)}
          />
        )}

        {editingSync && (
          <EditScheduleModal
            playlist={editingSync}
            onConfirm={handleEditSync}
            onCancel={() => setEditingSync(null)}
          />
        )}

        <main className="flex justify-center px-4">
          <div className="flex flex-col items-center mt-[8vh] sm:mt-[12vh] w-full max-w-3xl">
            {/* Download tab */}
            {activeTab === "download" && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Page title */}
                <p className="text-2xl font-light text-muted-foreground/50 tracking-tight select-none">
                  Download.
                </p>

                <div className="w-full flex flex-col sm:flex-row gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex items-center gap-2 shrink-0"
                        disabled={isDownloading}
                      >
                        <ActiveIcon className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">{provider}</span>
                        <span className="text-[10px] opacity-50 ml-1">▼</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onClick={() => setProvider("YouTube Music")}
                        className="cursor-pointer"
                      >
                        <SiYoutubemusic className="w-4 h-4 mr-2 shrink-0" />{" "}
                        YouTube Music
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setProvider("Spotify")}
                        className="cursor-pointer"
                      >
                        <SiSpotify className="w-4 h-4 mr-2 shrink-0" /> Spotify
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={`Paste ${provider} link here...`}
                    className="flex-1"
                    disabled={isDownloading}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !isDownloading && handleDownload()
                    }
                  />

                  <Button
                    onClick={handleDownload}
                    className="w-full sm:w-auto px-8 cursor-pointer"
                    disabled={isDownloading}
                  >
                    {isDownloading ? "Downloading…" : "Download"}
                  </Button>
                </div>

                {/* Tooltip showing where files will land */}
                <p className="text-xs text-muted-foreground/60 flex items-center gap-1 -mt-4">
                  <Info className="w-3 h-3 shrink-0" />
                  Files will be downloaded to:{" "}
                  <span className="font-mono">
                    {config.libraryPath || "/downloads"}
                  </span>
                </p>

                {queue.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-foreground">
                        Queue
                      </span>
                      {hasCompleted && (
                        <button
                          onClick={clearCompleted}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Clear completed
                        </button>
                      )}
                    </div>
                    {queue.map((item) => (
                      <QueueCard
                        key={item.id}
                        item={item}
                        now={now}
                        onCancel={handleCancel}
                        onToggleLogs={toggleLogs}
                      />
                    ))}
                  </div>
                )}

                {queue.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                      <SiYoutubemusic className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Paste a link above to start downloading
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Synchronisation tab */}
            {activeTab === "sync" && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Page title */}
                <p className="text-2xl font-light text-muted-foreground/50 tracking-tight select-none">
                  Sync.
                </p>

                <div className="flex items-center justify-between px-1">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Synchronisation{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (beta)
                      </span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Watch playlists and keep them in sync automatically.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAddSync(true)}
                    className="gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Watch playlist
                  </Button>
                </div>

                {syncPlaylists.length > 0 && (
                  <div className="space-y-3">
                    {syncPlaylists.map((p) => (
                      <SyncPlaylistCard
                        key={p.id}
                        playlist={p}
                        now={now}
                        onEdit={setEditingSync}
                        onDelete={handleDeleteSync}
                      />
                    ))}
                  </div>
                )}

                {syncPlaylists.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                      <RotateCw className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No watched playlists yet.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Click <strong>Watch playlist</strong> to start syncing one
                      automatically.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Configuration tab */}
            {activeTab === "config" && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Page title */}
                <p className="text-2xl font-light text-muted-foreground/50 tracking-tight select-none">
                  Config.
                </p>

                {/* Global config */}
                <Card className="w-full bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-xl">Configuration</CardTitle>
                    <CardDescription>
                      Changes are saved automatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Library selector */}
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold">
                        Library
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {isDockerMode
                            ? "select a destination"
                            : "(absolute path)"}
                        </span>
                      </Label>

                      {isDockerMode ? (
                        <>
                          <Select
                            value={config.libraryPath}
                            onValueChange={setLibraryPath}
                          >
                            <SelectTrigger className="bg-background w-full">
                              <SelectValue placeholder="Select a library…" />
                            </SelectTrigger>
                            <SelectContent>
                              {dockerLibraries.map((lib) => (
                                <SelectItem key={lib.path} value={lib.path}>
                                  {getDisplayName(lib)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>
                              Can't find your library? Make sure you've added
                              the correct{" "}
                              <code className="font-mono bg-muted px-1 rounded">
                                DROMEPORT_LIBRARY_*
                              </code>{" "}
                              environment variables in your{" "}
                              <code className="font-mono bg-muted px-1 rounded">
                                docker-compose.yml
                              </code>
                              .
                            </span>
                          </p>

                          <div className="space-y-2 pt-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                              Display Names
                            </p>
                            {dockerLibraries.map((lib) => (
                              <LibraryRow
                                key={lib.path}
                                library={lib}
                                displayName={getDisplayName(lib)}
                                onRename={renameLibrary}
                              />
                            ))}
                            <p className="text-xs text-muted-foreground">
                              Click <Pencil className="inline w-3 h-3 mx-0.5" />{" "}
                              to rename. Container paths are read-only.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Input
                            id="library-path"
                            value={config.libraryPath}
                            onChange={(e) => setLibraryPath(e.target.value)}
                            onBlur={() => {
                              if (
                                config.libraryPath &&
                                !isAbsolutePath(config.libraryPath)
                              )
                                setPathError(
                                  "Must be an absolute path (e.g. /home/user/Music).",
                                );
                              else setPathError("");
                            }}
                            placeholder="/home/user/Music"
                            className={`bg-background font-mono text-sm ${pathError ? "border-destructive" : ""}`}
                          />
                          {pathError && (
                            <p className="text-destructive text-xs">
                              {pathError}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    <Separator className="bg-border/50" />

                    {/* Playlist mode */}
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-semibold">
                          Playlist Download Mode
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          How to organise tracks when downloading a playlist or
                          album. Applies to both providers.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {(["flat", "folder"] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setPlaylistMode(mode)}
                            className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                              config.playlistMode === mode
                                ? "border-primary bg-primary/5"
                                : "border-border bg-background/50 hover:bg-accent/50"
                            }`}
                          >
                            <span className="text-sm font-medium">
                              {mode === "flat" ? "Flat" : "Playlist Folder"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {mode === "flat"
                                ? "All tracks directly in library root"
                                : "library/<playlist name>/tracks"}
                            </span>
                          </button>
                        ))}
                      </div>
                      {config.playlistMode === "folder" && (
                        <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                          💡 You'll be prompted to name the folder before each
                          playlist download starts.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* YouTube Music */}
                <Card className="w-full bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SiYoutubemusic className="w-5 h-5 text-[#FF0000]" />
                        <CardTitle className="text-lg">YouTube Music</CardTitle>
                      </div>
                      <a
                        href="https://github.com/yt-dlp/yt-dlp"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <SiGithub className="w-3.5 h-3.5" /> yt-dlp
                      </a>
                    </div>
                    <CardDescription>
                      Downloads via yt-dlp. Supports tracks and playlists.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Format
                      </Label>
                      <Select
                        value={config.ytMusic.quality}
                        onValueChange={(v) => setYtMusic("quality", v)}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="opus">
                            Opus - best quality, smallest size
                          </SelectItem>
                          <SelectItem value="m4a">M4A (AAC)</SelectItem>
                          <SelectItem value="mp3">
                            MP3 (VBR ~320 kbps)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
                      <div className="space-y-0.5 pr-4">
                        <Label className="text-sm">Embed Metadata</Label>
                        <p className="text-xs text-muted-foreground">
                          Title, artist, album, cover art
                        </p>
                      </div>
                      <Switch
                        checked={config.ytMusic.embedMetadata}
                        onCheckedChange={(v) => setYtMusic("embedMetadata", v)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
                      <div className="space-y-0.5 pr-4">
                        <Label className="text-sm">Enrich Metadata</Label>
                        <p className="text-xs text-muted-foreground">
                          Improve cover art and add genre via YouTube Music API
                        </p>
                      </div>
                      <Switch
                        checked={config.ytMusic.enrichMetadata}
                        onCheckedChange={(v) => setYtMusic("enrichMetadata", v)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Spotify */}
                <Card className="w-full bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SiSpotify className="w-5 h-5 text-[#1DB954]" />
                        <CardTitle className="text-lg">Spotify</CardTitle>
                      </div>
                      <a
                        href="https://github.com/jelte1/SpotiFLAC-Command-Line-Interface"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <SiGithub className="w-3.5 h-3.5" /> SpotiFLAC
                      </a>
                    </div>
                    <CardDescription>
                      Downloads FLAC via SpotiFLAC using Tidal, Qobuz, Deezer,
                      or Amazon Music.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Music Service
                      </Label>
                      <Select
                        value={config.spotify.spotiflacService}
                        onValueChange={(v) => setSpotify("spotiflacService", v)}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tidal">Tidal</SelectItem>
                          <SelectItem value="qobuz">Qobuz</SelectItem>
                          <SelectItem value="deezer">Deezer</SelectItem>
                          <SelectItem value="amazon">Amazon Music</SelectItem>
                          <SelectItem value="tidal qobuz">
                            Tidal → Qobuz (fallback)
                          </SelectItem>
                          <SelectItem value="tidal qobuz deezer">
                            Tidal → Qobuz → Deezer
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Output Format
                      </Label>
                      <Select
                        value={config.spotify.spotiflacOutputFormat}
                        onValueChange={(v) =>
                          setSpotify("spotiflacOutputFormat", v)
                        }
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flac">
                            FLAC - lossless (default, no transcoding)
                          </SelectItem>
                          <SelectItem value="opus">
                            Opus - lossy via FFmpeg (~320 kbps)
                          </SelectItem>
                          <SelectItem value="mp3">
                            MP3 - lossy via FFmpeg (VBR best)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {config.spotify.spotiflacOutputFormat !== "flac" && (
                        <p className="text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                          ⚠️ Transcoding with FFmpeg runs after the download
                          finishes and may take significant additional time for
                          large playlists. Metadata is preserved.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Filename Format
                      </Label>
                      <Input
                        value={config.spotify.spotiflacFilenameFormat}
                        onChange={(e) =>
                          setSpotify("spotiflacFilenameFormat", e.target.value)
                        }
                        placeholder="{track_number} {title} - {artist}"
                        className="bg-background font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Tokens:{" "}
                        {[
                          "{title}",
                          "{artist}",
                          "{album}",
                          "{track_number}",
                          "{year}",
                          "{isrc}",
                        ].map((t) => (
                          <code
                            key={t}
                            className="font-mono bg-muted px-1 rounded mr-1"
                          >
                            {t}
                          </code>
                        ))}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Subfolder Organisation
                      </Label>
                      <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
                        <div className="space-y-0.5 pr-4">
                          <Label className="text-sm">Artist Subfolders</Label>
                          <p className="text-xs text-muted-foreground">
                            library/<em>Artist</em>/tracks
                          </p>
                        </div>
                        <Switch
                          checked={config.spotify.spotiflacArtistSubfolders}
                          onCheckedChange={(v) =>
                            setSpotify("spotiflacArtistSubfolders", v)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
                        <div className="space-y-0.5 pr-4">
                          <Label className="text-sm">Album Subfolders</Label>
                          <p className="text-xs text-muted-foreground">
                            library/<em>Album</em>/tracks
                          </p>
                        </div>
                        <Switch
                          checked={config.spotify.spotiflacAlbumSubfolders}
                          onCheckedChange={(v) =>
                            setSpotify("spotiflacAlbumSubfolders", v)
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Retry Loop (minutes)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={config.spotify.spotiflacLoop}
                        onChange={(e) =>
                          setSpotify(
                            "spotiflacLoop",
                            parseInt(e.target.value) || 0,
                          )
                        }
                        className="bg-background w-28"
                      />
                      <p className="text-xs text-muted-foreground">
                        0 = no retry. Set e.g. 120 to keep retrying for 2 hours
                        on failure.
                      </p>
                    </div>

                    <Separator className="bg-border/50" />

                    {/* Metadata enrichment */}
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-semibold">
                          Metadata Enrichment
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          After each download, enrich files with BPM, key,
                          genre, label, and high-res cover art from Spotify,
                          MusicBrainz, and optionally Last.fm.
                        </p>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
                        <div className="space-y-0.5 pr-4">
                          <Label className="text-sm">Enable Enrichment</Label>
                          <p className="text-xs text-muted-foreground">
                            Adds BPM, key, genre, label · no API key needed
                          </p>
                        </div>
                        <Switch
                          checked={config.spotify.enrichMetadata}
                          onCheckedChange={(v) =>
                            setSpotify("enrichMetadata", v)
                          }
                        />
                      </div>

                      {config.spotify.enrichMetadata && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                            Last.fm API Key
                            <span className="ml-2 normal-case font-normal">
                              (optional)
                            </span>
                          </Label>
                          <Input
                            type="password"
                            value={config.spotify.lastfmApiKey}
                            onChange={(e) =>
                              setSpotify("lastfmApiKey", e.target.value)
                            }
                            placeholder="Paste your Last.fm API key..."
                            className="bg-background font-mono text-sm"
                          />
                          <p className="text-xs text-muted-foreground">
                            Adds crowdsourced track-level genre tags. Get a free
                            key at{" "}
                            <a
                              href="https://www.last.fm/api/account/create"
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-foreground transition-colors"
                            >
                              last.fm/api
                            </a>
                            .
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <ToolsCard
                  versions={toolVersions}
                  onRefreshVersions={fetchVersions}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;