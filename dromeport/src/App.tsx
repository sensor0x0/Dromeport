/*
  This is a horrendous file in terms of size.
  I know. I'm sorry. Refactoring is on the roadmap, but for now please bear with me 🙏
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { SiSpotify, SiYoutubemusic, SiGithub } from "react-icons/si";
import {
  Info,
  Plus,
  Pencil,
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

import { QueueCard } from "@/components/QueueCard";
import { PlaylistModal } from "@/components/PlaylistModal";
import { LibraryRow } from "@/components/LibraryRow";
import { ToolsCard } from "@/components/ToolsCard";
import { AddSyncModal } from "@/components/AddSyncModal";
import type { AddSyncModalProps } from "@/components/AddSyncModal";
import { EditScheduleModal } from "@/components/EditScheduleModal";
import { SyncPlaylistCard } from "@/components/SyncPlaylistCard";
import { SearchDropdown } from "@/components/SearchDropdown";
import type { SearchResult } from "@/components/SearchDropdown";

import { API, DEFAULT_CONFIG } from "@/constants";
import { isAbsolutePath, isPlaylistUrl, looksLikeUrl } from "@/utils";
import type {
  Provider,
  QueueItem,
  AppConfig,
  DockerLibrary,
  ServerConfig,
  ToolVersions,
  SyncPlaylist,
} from "@/types";

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

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [toolVersions, setToolVersions] = useState<ToolVersions | null>(null);

  const [syncPlaylists, setSyncPlaylists] = useState<SyncPlaylist[]>([]);
  const [showAddSync, setShowAddSync] = useState(false);
  const [editingSync, setEditingSync] = useState<SyncPlaylist | null>(null);

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

  // Debounce search term and fetch results
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

  // Close dropdown on outside click
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
    setShowSearch(false);
    setSearchResults([]);
  };

  useEffect(() => {
    fetch(`${API}/api/config`)
      .then((r) => r.json())
      .then((data: ServerConfig) => {
        setServerConfig(data);
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

  const fetchVersions = useCallback(() => {
    fetch(`${API}/api/tools/versions`)
      .then((r) => r.json())
      .then((data: ToolVersions) => setToolVersions(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "config") fetchVersions();
  }, [activeTab, fetchVersions]);

  const fetchSyncPlaylists = useCallback(() => {
    fetch(`${API}/api/sync/playlists`)
      .then((r) => r.json())
      .then((data: SyncPlaylist[]) => setSyncPlaylists(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "sync") fetchSyncPlaylists();
  }, [activeTab, fetchSyncPlaylists]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem("dromeport-config", JSON.stringify(config));
  }, [config]);

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
          // Ignore
        }
      });

      es.addEventListener("status", (e: MessageEvent<string>) => {
        try {
          const data = JSON.parse(e.data) as { success: boolean };
          if (!data.success) {
            updateQueue(activeJobIdRef.current!, { status: "error" });
          }
        } catch {
          // Ignore
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
      // Ignore
    }
  };

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
      // Ignore
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
      // Ignore
    }
  };

  const handleDeleteSync = async (id: string) => {
    try {
      await fetch(`${API}/api/sync/playlists/${id}`, { method: "DELETE" });
      setSyncPlaylists((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // Ignore
    }
  };

  const hasCompleted = queue.some((q) => q.status !== "downloading");

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
            {activeTab === "download" && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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

                  {/* Search-aware URL input */}
                  <div className="relative flex-1" ref={searchContainerRef}>
                    <Input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={`Search or paste a ${provider} link...`}
                      className="w-full"
                      disabled={isDownloading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isDownloading) {
                          setShowSearch(false);
                          handleDownload();
                        }
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

                  <Button
                    onClick={handleDownload}
                    className="w-full sm:w-auto px-8 cursor-pointer"
                    disabled={isDownloading}
                  >
                    {isDownloading ? "Downloading…" : "Download"}
                  </Button>
                </div>

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
                      Search or paste a link above to start downloading
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "sync" && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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

            {activeTab === "config" && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="text-2xl font-light text-muted-foreground/50 tracking-tight select-none">
                  Config.
                </p>

                <Card className="w-full bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="text-xl">Configuration</CardTitle>
                    <CardDescription>
                      Changes are saved automatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
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