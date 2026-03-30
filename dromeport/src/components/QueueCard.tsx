import { useEffect, useRef } from "react";
import { SiSpotify, SiYoutubemusic } from "react-icons/si";
import {
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import type { QueueItem } from "@/types";

interface QueueCardProps {
  item: QueueItem;
  now: number;
  onCancel: (item: QueueItem) => void;
  onToggleLogs: (id: string) => void;
}

export function QueueCard({
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

function formatTime(seconds: number): string {
  if (seconds < 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
