import { useState, useEffect, useRef } from "react";
import { Pencil, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { DockerLibrary } from "@/types";

interface LibraryRowProps {
  library: DockerLibrary;
  displayName: string;
  onRename: (path: string, name: string) => void;
}

export function LibraryRow({ library, displayName, onRename }: LibraryRowProps) {
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
