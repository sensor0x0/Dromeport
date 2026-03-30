import { useState } from "react";
import { SiSpotify, SiYoutubemusic } from "react-icons/si";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScheduleForm, type ScheduleFormProps } from "./ScheduleForm";
import type { SyncPlaylist } from "@/types";

interface EditScheduleModalProps {
  playlist: SyncPlaylist;
  onConfirm: (updates: Partial<SyncPlaylist>) => void;
  onCancel: () => void;
}

export function EditScheduleModal({
  playlist,
  onConfirm,
  onCancel,
}: EditScheduleModalProps) {
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">(
    playlist.schedule_type,
  );
  const [intervalValue, setIntervalValue] = useState(playlist.interval_value);
  const [intervalUnit, setIntervalUnit] = useState<
    "minutes" | "hours" | "days"
  >(playlist.interval_unit);
  const [cronTime, setCronTime] = useState(playlist.cron_time);
  const [cronDays, setCronDays] = useState(playlist.cron_days);
  const [enabled, setEnabled] = useState(playlist.enabled);

  const handleScheduleChange = (
    updates: Parameters<ScheduleFormProps["onChange"]>[0],
  ) => {
    if (updates.scheduleType !== undefined)
      setScheduleType(updates.scheduleType);
    if (updates.intervalValue !== undefined)
      setIntervalValue(updates.intervalValue);
    if (updates.intervalUnit !== undefined)
      setIntervalUnit(updates.intervalUnit);
    if (updates.cronTime !== undefined) setCronTime(updates.cronTime);
    if (updates.cronDays !== undefined) setCronDays(updates.cronDays);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 mb-4">
          {playlist.provider === "Spotify" ? (
            <SiSpotify className="w-4 h-4 text-[#1DB954]" />
          ) : (
            <SiYoutubemusic className="w-4 h-4 text-[#FF0000]" />
          )}
          <h2 className="text-base font-semibold truncate">{playlist.name}</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Schedule</Label>
            <ScheduleForm
              scheduleType={scheduleType}
              intervalValue={intervalValue}
              intervalUnit={intervalUnit}
              cronTime={cronTime}
              cronDays={cronDays}
              onChange={handleScheduleChange}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3 bg-background/50">
            <div className="space-y-0.5 pr-4">
              <Label className="text-sm">Enabled</Label>
              <p className="text-xs text-muted-foreground">
                Pause without deleting
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onConfirm({
                schedule_type: scheduleType,
                interval_value: intervalValue,
                interval_unit: intervalUnit,
                cron_time: cronTime,
                cron_days: cronDays,
                enabled,
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
