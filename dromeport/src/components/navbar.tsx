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
      <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4 mx-auto">
        <div className="flex items-center gap-8">
          <div className="flex items-baseline gap-1.5">
            <img src="/dromeport.svg" alt="Dromeport" className="h-6 w-6 sm:h-7 sm:w-7 self-center dark:invert" />
            <span className="font-bold text-lg tracking-tight">Dromeport</span>
            <span className="text-xs text-muted-foreground font-medium">
              v0.1.0-beta
            </span>
          </div>
          
          <nav className="flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => setActiveTab("download")}
              className={`cursor-pointer transition-colors hover:text-foreground/80 ${
                activeTab === "download" ? "text-foreground" : "text-foreground/60"
              }`}
            >
              Download
            </button>
            <button
              onClick={() => setActiveTab("sync")}
              className={`cursor-pointer transition-colors hover:text-foreground/80 ${
                activeTab === "sync" ? "text-foreground" : "text-foreground/60"
              }`}
            >
              Synchronisation{" "}
              <span className="text-[10px] text-muted-foreground font-normal">beta</span>
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`cursor-pointer transition-colors hover:text-foreground/80 ${
                activeTab === "config" ? "text-foreground" : "text-foreground/60"
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
    </header>
  );
}