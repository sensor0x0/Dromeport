import type { SyncPlaylist } from "./types";

export function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p);
}

export function isPlaylistUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    /spotify\.com\/(playlist|album)\//.test(u) ||
    (u.includes("list=") && !u.includes("watch?v=")) ||
    u.includes("/playlist?") ||
    (/youtube/.test(u) && u.includes("/album/"))
  );
}

// Returns true if the user has entered a URL or something that is similar.
// Used to decide whether to show search results or not.
export function looksLikeUrl(str: string): boolean {
  return /^https?:\/\/|^spotify:|spotify\.com|youtube\.com|music\.youtube\.com|youtu\.be/.test(
    str.trim(),
  );
}

export function formatTime(seconds: number): string {
  if (seconds < 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatRelativeTime(isoString: string | null, now: number): string {
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

export function formatTimeUntil(isoString: string | null, now: number): string {
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

export function describeSchedule(p: SyncPlaylist): string {
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