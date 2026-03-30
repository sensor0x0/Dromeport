import { useState, useEffect, useRef } from "react";
import { SiSpotify, SiYoutubemusic } from "react-icons/si";
import {
  RefreshCw,
  CheckCircle,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ToolVersions } from "@/types";
import { API } from "@/constants";

interface ToolsCardProps {
  versions: ToolVersions | null;
  onRefreshVersions: () => void;
}

export function ToolsCard({ versions, onRefreshVersions }: ToolsCardProps) {
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
          yt-dlp, SpotiFLAC, and ytmusicapi are installed as pip packages. Use
          Update All to upgrade them in place without restarting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <SiYoutubemusic className="w-4 h-4 text-[#FF0000]" />
              <span className="text-sm font-medium">ytmusicapi</span>
            </div>
            <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {versions ? versions.ytmusicapi : "…"}
            </code>
          </div>
        </div>

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