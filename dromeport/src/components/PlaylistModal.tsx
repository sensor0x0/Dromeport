import { useState, useEffect, useRef } from "react";
import { SiSpotify, SiYoutubemusic } from "react-icons/si";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Provider } from "@/types";

interface PlaylistModalProps {
  url: string;
  provider: Provider;
  onConfirm: (folderName: string) => void;
  onCancel: () => void;
}

export function PlaylistModal({
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
