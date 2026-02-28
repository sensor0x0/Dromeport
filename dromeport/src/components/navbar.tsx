import { SiGithub } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

interface NavbarProps {
  activeTab: "download" | "config" | "sync";
  setActiveTab: (tab: "download" | "config" | "sync") => void;
}

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-screen-2xl mx-auto px-4">
        {/* Main row - logo, desktop nav, and action buttons */}
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-baseline gap-1.5">
              <img
                src="/dromeport.svg"
                alt="Dromeport"
                className="h-6 w-6 sm:h-7 sm:w-7 self-center dark:invert"
              />
              <span className="font-bold text-lg tracking-tight">
                Dromeport
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                v0.2.0-beta
              </span>
            </div>

            {/* Desktop nav - hidden on mobile */}
            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium">
              <button
                onClick={() => setActiveTab("download")}
                className={`cursor-pointer transition-colors hover:text-foreground/80 ${
                  activeTab === "download"
                    ? "text-foreground"
                    : "text-foreground/60"
                }`}
              >
                Download
              </button>
              <button
                onClick={() => setActiveTab("sync")}
                className={`cursor-pointer transition-colors hover:text-foreground/80 ${
                  activeTab === "sync"
                    ? "text-foreground"
                    : "text-foreground/60"
                }`}
              >
                Synchronisation{" "}
                <span className="text-[10px] text-muted-foreground font-normal">
                  beta
                </span>
              </button>
              <button
                onClick={() => setActiveTab("config")}
                className={`cursor-pointer transition-colors hover:text-foreground/80 ${
                  activeTab === "config"
                    ? "text-foreground"
                    : "text-foreground/60"
                }`}
              >
                Configuration
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <a
                href="https://github.com/sensor0x0/Dromeport"
                target="_blank"
                rel="noreferrer"
              >
                <SiGithub className="h-[1.2rem] w-[1.2rem]" />
                <span className="sr-only">GitHub</span>
              </a>
            </Button>
            <ModeToggle />
          </div>
        </div>

        {/* Mobile nav - shown below the main row on small screens */}
        <nav className="flex sm:hidden items-center gap-5 text-sm font-medium pb-2.5 pt-0.5 border-t border-border/30">
          <button
            onClick={() => setActiveTab("download")}
            className={`cursor-pointer transition-colors hover:text-foreground/80 py-1 ${
              activeTab === "download"
                ? "text-foreground border-b-2 border-foreground"
                : "text-foreground/60"
            }`}
          >
            Download
          </button>
          <button
            onClick={() => setActiveTab("sync")}
            className={`cursor-pointer transition-colors hover:text-foreground/80 py-1 ${
              activeTab === "sync"
                ? "text-foreground border-b-2 border-foreground"
                : "text-foreground/60"
            }`}
          >
            Sync{" "}
            <span className="text-[10px] text-muted-foreground font-normal">
              beta
            </span>
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`cursor-pointer transition-colors hover:text-foreground/80 py-1 ${
              activeTab === "config"
                ? "text-foreground border-b-2 border-foreground"
                : "text-foreground/60"
            }`}
          >
            Config
          </button>
        </nav>
      </div>
    </header>
  );
}
