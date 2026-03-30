import { useState, useEffect, useRef } from "react";
import { SiSpotify, SiYoutubemusic } from "react-icons/si";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  Play,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import type { SyncPlaylist } from "@/types";
import { describeSchedule, formatRelativeTime, formatTimeUntil } from "@/utils";
import { API } from "@/constants";

interface SyncPlaylistCardProps {
  playlist: SyncPlaylist;
  now: number;
  onEdit: (playlist: SyncPlaylist) => void;
  onDelete: (id: string) => void;
}

export function SyncPlaylistCard({
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
    setLastStatus(null);

    const es = new EventSource(`${API}/api/sync/playlists/${playlist.id}/run`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      if (e.data === "[DONE]") {
        es.close();
        esRef.current = null;
        setSyncing(false);
        setLastSyncedAt(new Date().toISOString());
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
