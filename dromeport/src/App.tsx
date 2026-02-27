import { useState, useEffect, useRef, useCallback } from "react";
import { SiSpotify, SiYoutubemusic, SiGithub } from "react-icons/si";
import {
  X, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle,
  AlertTriangle, Pencil, Check, Info, RefreshCw, Package,
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
  spotiflacPath: string;
  isDocker: boolean;
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
    spotiflacPath: string;
    spotiflacService: string;
    spotiflacLoop: number;
    spotiflacArtistSubfolders: boolean;
    spotiflacAlbumSubfolders: boolean;
    spotiflacFilenameFormat: string;
    spotiflacOutputFormat: string;
    embedMetadata: boolean;
  };
  ytMusic: {
    quality: string;
    embedMetadata: boolean;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  libraryPath: "",
  playlistMode: "flat",
  spotify: {
    spotiflacPath: "",
    spotiflacService: "tidal",
    spotiflacLoop: 0,
    spotiflacArtistSubfolders: false,
    spotiflacAlbumSubfolders: true,
    spotiflacFilenameFormat: "{track_number} {title} - {artist}",
    spotiflacOutputFormat: "flac",
    embedMetadata: true,
  },
  ytMusic: { quality: "opus", embedMetadata: true },
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

// Queue card

interface QueueCardProps {
  item: QueueItem;
  tick: number;
  onCancel: (item: QueueItem) => void;
  onToggleLogs: (id: string) => void;
}

function QueueCard({ item, tick: _tick, onCancel, onToggleLogs }: QueueCardProps) {
  const logsRef = useRef<HTMLTextAreaElement>(null);
  const isActive = item.status === "downloading";
  const elapsed = Math.floor(((item.finishedAt ?? Date.now()) - item.startedAt) / 1000);
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

  const StatusIcon = () => {
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
              <img src={item.thumb} className="w-full h-full object-cover" alt="" />
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
              ) : item.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.provider}</p>
          </div>
          <div className="flex-shrink-0"><StatusIcon /></div>
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
                  item.status === "done" ? "bg-green-500" :
                  item.status === "error" ? "bg-red-500" :
                  item.status === "cancelled" ? "bg-muted-foreground" : "bg-primary"
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
            {isActive && eta !== null && <span className="ml-1">· ETA ~{formatTime(eta)}</span>}
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
              {item.logsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
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

function PlaylistModal({ url, provider, onConfirm, onCancel }: PlaylistModalProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 mb-1">
          {provider === "Spotify"
            ? <SiSpotify className="w-4 h-4 text-[#1DB954]" />
            : <SiYoutubemusic className="w-4 h-4 text-[#FF0000]" />}
          <h2 className="text-base font-semibold">Name this playlist folder</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          You have <strong>Playlist Folder</strong> mode enabled. Enter the folder name for this download.
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
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={() => onConfirm(name.trim())} disabled={!name.trim()}>
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

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

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
                if (e.key === "Escape") { setDraft(displayName); setEditing(false); }
              }}
              onBlur={commit}
              className="h-7 text-sm py-0 px-2 bg-background"
            />
            <button onClick={commit} className="shrink-0 text-green-500 hover:text-green-400 transition-colors" title="Save">
              <Check className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium truncate">{displayName}</span>
            <button
              onClick={() => { setDraft(displayName); setEditing(true); }}
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
            <RefreshCw className={`w-3.5 h-3.5 ${updating ? "animate-spin" : ""}`} />
            {updating ? "Updating…" : "Update All"}
          </Button>
        </div>
        <CardDescription>
          yt-dlp and SpotiFLAC are bundled in this image. Updates run inside the container - no rebuild needed.
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

// Main app

function App() {
  const [activeTab, setActiveTab] = useState<"download" | "config">("download");
  const [provider, setProvider] = useState<Provider>("YouTube Music");
  const [url, setUrl] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [pathError, setPathError] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [tick, setTick] = useState(0);
  const [pendingDownload, setPendingDownload] = useState<{ url: string; provider: Provider } | null>(null);

  // Server-driven state
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [toolVersions, setToolVersions] = useState<ToolVersions | null>(null);

  // Library display name overrides persisted in localStorage
  const [libraryNames, setLibraryNames] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("dromeport-library-names") ?? "{}") as Record<string, string>;
    } catch { return {}; }
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const ActiveIcon = provider === "Spotify" ? SiSpotify : SiYoutubemusic;
  const isDockerMode = serverConfig?.isDocker ?? false;
  const dockerLibraries = serverConfig?.libraries ?? [];

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
    } catch { return DEFAULT_CONFIG; }
  });

  // Effects

  // Fetch server config on mount
  useEffect(() => {
    fetch(`${API}/api/config`)
      .then((r) => r.json())
      .then((data: ServerConfig) => {
        setServerConfig(data);
        // Auto-select first library if no path set yet
        if (data.libraries.length > 0 && !config.libraryPath) {
          setConfig((prev) => ({ ...prev, libraryPath: data.libraries[0].path }));
        }
      })
      .catch(() => {
        setServerConfig({ libraries: [], spotiflacPath: "", isDocker: false });
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

  // Ticker for elapsed time
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Persist config
  useEffect(() => {
    localStorage.setItem("dromeport-config", JSON.stringify(config));
  }, [config]);

  // Persist library name overrides
  useEffect(() => {
    localStorage.setItem("dromeport-library-names", JSON.stringify(libraryNames));
  }, [libraryNames]);

  useEffect(() => () => { eventSourceRef.current?.close(); }, []);

  // Config helpers

  const setLibraryPath = (val: string) => {
    if (isAbsolutePath(val) || val === "") setPathError("");
    setConfig((prev) => ({ ...prev, libraryPath: val }));
  };

  const setPlaylistMode = (val: "flat" | "folder") =>
    setConfig((prev) => ({ ...prev, playlistMode: val }));

  const setYtMusic = (key: keyof AppConfig["ytMusic"], val: string | boolean) =>
    setConfig((prev) => ({ ...prev, ytMusic: { ...prev.ytMusic, [key]: val } }));

  const setSpotify = (key: keyof AppConfig["spotify"], val: string | boolean | number) =>
    setConfig((prev) => ({ ...prev, spotify: { ...prev.spotify, [key]: val } }));

  const renameLibrary = (path: string, name: string) =>
    setLibraryNames((prev) => ({ ...prev, [path]: name }));

  const getDisplayName = (lib: DockerLibrary) =>
    libraryNames[lib.path] ?? lib.defaultName;

  // Queue helpers

  const updateQueue = useCallback((id: string, updates: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  }, []);

  const toggleLogs = useCallback((id: string) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, logsOpen: !q.logsOpen } : q)));
  }, []);

  const clearCompleted = () =>
    setQueue((prev) => prev.filter((q) => q.status === "downloading"));

  // Download logic

  const startDownload = useCallback(
    (dlUrl: string, dlProvider: Provider, playlistFolder: string) => {
      if (!config.libraryPath.trim() || !isAbsolutePath(config.libraryPath)) return;

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

      const es = new EventSource(`${API}/api/download/stream?${params.toString()}`);
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
                  prev.map((q) => (q.id === currentId ? { ...q, id: data.value! } : q))
                );
                activeJobIdRef.current = data.value;
              }
              break;
            case "title":
              if (data.value) updateQueue(activeJobIdRef.current!, { title: data.value });
              break;
            case "thumb":
              if (data.url) updateQueue(activeJobIdRef.current!, { thumb: data.url });
              break;
            case "progress":
              updateQueue(activeJobIdRef.current!, {
                current: data.current ?? 0,
                total: data.total ?? 0,
              });
              break;
          }
        } catch { /* ignore */ }
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
                ? { ...q, status: "done", finishedAt: Date.now(), logsOpen: false }
                : q
            )
          );
          return;
        }
        const line = event.data === "" ? "\n" : "\n" + event.data;
        const isError = event.data.startsWith("ERROR:") || event.data.includes("❌");
        setQueue((prev) =>
          prev.map((q) =>
            q.id === currentId
              ? { ...q, logs: q.logs + line, errors: isError ? q.errors + 1 : q.errors }
              : q
          )
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
                  ? { ...q, status: "error", finishedAt: Date.now(), logsOpen: true }
                  : q
              )
            );
          }
          eventSourceRef.current = null;
        }
      };
    },
    [config, updateQueue]
  );

  const handleDownload = () => {
    if (!url.trim()) return;
    if (!config.libraryPath.trim()) { setPathError("Path is required."); setActiveTab("config"); return; }
    if (!isAbsolutePath(config.libraryPath)) { setPathError("Must be an absolute path."); setActiveTab("config"); return; }
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
        { method: "DELETE" }
      );
    } catch { /* ignore */ }
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

        <main className="flex justify-center px-4">
          <div className="flex flex-col items-center mt-[8vh] sm:mt-[12vh] w-full max-w-3xl">

            {/* Download tab */}
            {activeTab === "download" && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="w-full flex flex-col sm:flex-row gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="flex items-center gap-2 shrink-0" disabled={isDownloading}>
                        <ActiveIcon className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">{provider}</span>
                        <span className="text-[10px] opacity-50 ml-1">▼</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => setProvider("YouTube Music")} className="cursor-pointer">
                        <SiYoutubemusic className="w-4 h-4 mr-2 shrink-0" /> YouTube Music
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setProvider("Spotify")} className="cursor-pointer">
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
                    onKeyDown={(e) => e.key === "Enter" && !isDownloading && handleDownload()}
                  />

                  <Button
                    onClick={handleDownload}
                    className="w-full sm:w-auto px-8 cursor-pointer"
                    disabled={isDownloading}
                  >
                    {isDownloading ? "Downloading…" : "Download"}
                  </Button>
                </div>

                {queue.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-foreground">Queue</span>
                      {hasCompleted && (
                        <button onClick={clearCompleted} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                          Clear completed
                        </button>
                      )}
                    </div>
                    {queue.map((item) => (
                      <QueueCard key={item.id} item={item} tick={tick} onCancel={handleCancel} onToggleLogs={toggleLogs} />
                    ))}
                  </div>
                )}

                {queue.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                      <SiYoutubemusic className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Paste a link above to start downloading</p>
                  </div>
                )}
              </div>
            )}

            {/* Configuration tab */}
            {activeTab === "config" && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

                {/* Global config */}
                <Card className="w-full bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-xl">Configuration</CardTitle>
                    <CardDescription>Changes are saved automatically.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">

                    {/* Library selector */}
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold">
                        Library
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {isDockerMode ? "select a destination" : "(absolute path)"}
                        </span>
                      </Label>

                      {isDockerMode ? (
                        <>
                          <Select value={config.libraryPath} onValueChange={setLibraryPath}>
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
                            Can't find your library? Make sure you've added the correct{" "}
                            <code className="font-mono bg-muted px-1 rounded">DROMEPORT_LIBRARY_*</code>{" "}
                            environment variables in your{" "}
                            <code className="font-mono bg-muted px-1 rounded">docker-compose.yml</code>.
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
                              Click <Pencil className="inline w-3 h-3 mx-0.5" /> to rename. Container paths are read-only.
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
                              if (config.libraryPath && !isAbsolutePath(config.libraryPath))
                                setPathError("Must be an absolute path (e.g. /home/user/Music).");
                              else setPathError("");
                            }}
                            placeholder="/home/user/Music"
                            className={`bg-background font-mono text-sm ${pathError ? "border-destructive" : ""}`}
                          />
                          {pathError && <p className="text-destructive text-xs">{pathError}</p>}
                        </>
                      )}
                    </div>

                    <Separator className="bg-border/50" />

                    {/* Playlist mode */}
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-semibold">Playlist Download Mode</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          How to organise tracks when downloading a playlist or album. Applies to both providers.
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
                          💡 You'll be prompted to name the folder before each playlist download starts.
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
                      <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <SiGithub className="w-3.5 h-3.5" /> yt-dlp
                      </a>
                    </div>
                    <CardDescription>Downloads via yt-dlp. Supports tracks and playlists.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Format</Label>
                      <Select value={config.ytMusic.quality} onValueChange={(v) => setYtMusic("quality", v)}>
                        <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="opus">Opus - best quality, smallest size</SelectItem>
                          <SelectItem value="m4a">M4A (AAC)</SelectItem>
                          <SelectItem value="mp3">MP3 (VBR ~320 kbps)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
                      <div className="space-y-0.5 pr-4">
                        <Label className="text-sm">Embed Metadata</Label>
                        <p className="text-xs text-muted-foreground">Title, artist, album, cover art</p>
                      </div>
                      <Switch
                        checked={config.ytMusic.embedMetadata}
                        onCheckedChange={(v) => setYtMusic("embedMetadata", v)}
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
                      <a href="https://github.com/jelte1/SpotiFLAC-Command-Line-Interface" target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <SiGithub className="w-3.5 h-3.5" /> SpotiFLAC
                      </a>
                    </div>
                    <CardDescription>
                      Downloads FLAC via SpotiFLAC using Tidal, Qobuz, Deezer, or Amazon Music.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">

                    {/* SpotiFLAC path — hidden in Docker (pre-installed) */}
                    {isDockerMode ? (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">SpotiFLAC is pre-installed</p>
                          <code className="text-xs text-muted-foreground font-mono">
                            {serverConfig?.spotiflacPath ?? "/opt/spotiflac/launcher.py"}
                          </code>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">
                          SpotiFLAC Path
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (path to binary or launcher.py)
                          </span>
                        </Label>
                        <Input
                          value={config.spotify.spotiflacPath}
                          onChange={(e) => setSpotify("spotiflacPath", e.target.value)}
                          placeholder="/opt/SpotiFLAC/SpotiFLAC-Linux-x64  or  /opt/SpotiFLAC/launcher.py"
                          className="bg-background font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          For a binary, make sure it's executable:{" "}
                          <code className="font-mono bg-muted px-1 rounded">chmod +x /path/to/SpotiFLAC</code>
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Music Service</Label>
                      <Select value={config.spotify.spotiflacService} onValueChange={(v) => setSpotify("spotiflacService", v)}>
                        <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tidal">Tidal</SelectItem>
                          <SelectItem value="qobuz">Qobuz</SelectItem>
                          <SelectItem value="deezer">Deezer</SelectItem>
                          <SelectItem value="amazon">Amazon Music</SelectItem>
                          <SelectItem value="tidal qobuz">Tidal → Qobuz (fallback)</SelectItem>
                          <SelectItem value="tidal qobuz deezer">Tidal → Qobuz → Deezer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Output Format</Label>
                      <Select value={config.spotify.spotiflacOutputFormat} onValueChange={(v) => setSpotify("spotiflacOutputFormat", v)}>
                        <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flac">FLAC — lossless (default, no transcoding)</SelectItem>
                          <SelectItem value="opus">Opus — lossy via FFmpeg (~320 kbps)</SelectItem>
                          <SelectItem value="mp3">MP3 — lossy via FFmpeg (VBR best)</SelectItem>
                        </SelectContent>
                      </Select>
                      {config.spotify.spotiflacOutputFormat !== "flac" && (
                        <p className="text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                          ⚠️ Transcoding with FFmpeg runs after the download finishes and may take significant additional time for large playlists. Metadata is preserved.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Filename Format</Label>
                      <Input
                        value={config.spotify.spotiflacFilenameFormat}
                        onChange={(e) => setSpotify("spotiflacFilenameFormat", e.target.value)}
                        placeholder="{track_number} {title} - {artist}"
                        className="bg-background font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Tokens:{" "}
                        {["{title}", "{artist}", "{album}", "{track_number}", "{year}", "{isrc}"].map((t) => (
                          <code key={t} className="font-mono bg-muted px-1 rounded mr-1">{t}</code>
                        ))}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Subfolder Organisation</Label>
                      <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
                        <div className="space-y-0.5 pr-4">
                          <Label className="text-sm">Artist Subfolders</Label>
                          <p className="text-xs text-muted-foreground">library/<em>Artist</em>/tracks</p>
                        </div>
                        <Switch
                          checked={config.spotify.spotiflacArtistSubfolders}
                          onCheckedChange={(v) => setSpotify("spotiflacArtistSubfolders", v)}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
                        <div className="space-y-0.5 pr-4">
                          <Label className="text-sm">Album Subfolders</Label>
                          <p className="text-xs text-muted-foreground">library/<em>Album</em>/tracks</p>
                        </div>
                        <Switch
                          checked={config.spotify.spotiflacAlbumSubfolders}
                          onCheckedChange={(v) => setSpotify("spotiflacAlbumSubfolders", v)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Retry Loop (minutes)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={config.spotify.spotiflacLoop}
                        onChange={(e) => setSpotify("spotiflacLoop", parseInt(e.target.value) || 0)}
                        className="bg-background w-28"
                      />
                      <p className="text-xs text-muted-foreground">
                        0 = no retry. Set e.g. 120 to keep retrying for 2 hours on failure.
                      </p>
                    </div>

                  </CardContent>
                </Card>

                {/* Bundled tools card - only shown in Docker mode */}
                {isDockerMode && (
                  <ToolsCard versions={toolVersions} onRefreshVersions={fetchVersions} />
                )}

              </div>
            )}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;