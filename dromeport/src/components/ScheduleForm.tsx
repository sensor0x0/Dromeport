import { Timer, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ScheduleFormProps {
  scheduleType: "interval" | "cron";
  intervalValue: number;
  intervalUnit: "minutes" | "hours" | "days";
  cronTime: string;
  cronDays: string;
  onChange: (
    updates: Partial<{
      scheduleType: "interval" | "cron";
      intervalValue: number;
      intervalUnit: "minutes" | "hours" | "days";
      cronTime: string;
      cronDays: string;
    }>,
  ) => void;
}

export function ScheduleForm({
  scheduleType,
  intervalValue,
  intervalUnit,
  cronTime,
  cronDays,
  onChange,
}: ScheduleFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ scheduleType: "interval" })}
          className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
            scheduleType === "interval"
              ? "border-primary bg-primary/5"
              : "border-border bg-background/50 hover:bg-accent/50"
          }`}
        >
          <Timer className="w-4 h-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Every X time</p>
            <p className="text-xs text-muted-foreground">e.g. every 6 hours</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange({ scheduleType: "cron" })}
          className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
            scheduleType === "cron"
              ? "border-primary bg-primary/5"
              : "border-border bg-background/50 hover:bg-accent/50"
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Specific time</p>
            <p className="text-xs text-muted-foreground">e.g. daily at 08:00</p>
          </div>
        </button>
      </div>

      {scheduleType === "interval" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">Every</span>
          <Input
            type="number"
            min={1}
            value={intervalValue}
            onChange={(e) =>
              onChange({
                intervalValue: Math.max(1, parseInt(e.target.value) || 1),
              })
            }
            className="bg-background w-20"
          />
          <Select
            value={intervalUnit}
            onValueChange={(v) =>
              onChange({ intervalUnit: v as "minutes" | "hours" | "days" })
            }
          >
            <SelectTrigger className="bg-background w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">minutes</SelectItem>
              <SelectItem value="hours">hours</SelectItem>
              <SelectItem value="days">days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {scheduleType === "cron" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={cronDays}
            onValueChange={(v) => onChange({ cronDays: v })}
          >
            <SelectTrigger className="bg-background w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Every day</SelectItem>
              <SelectItem value="weekdays">Weekdays</SelectItem>
              <SelectItem value="weekends">Weekends</SelectItem>
              <SelectItem value="mon">Mondays</SelectItem>
              <SelectItem value="tue">Tuesdays</SelectItem>
              <SelectItem value="wed">Wednesdays</SelectItem>
              <SelectItem value="thu">Thursdays</SelectItem>
              <SelectItem value="fri">Fridays</SelectItem>
              <SelectItem value="sat">Saturdays</SelectItem>
              <SelectItem value="sun">Sundays</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground shrink-0">at</span>
          <Input
            type="time"
            value={cronTime}
            onChange={(e) => onChange({ cronTime: e.target.value })}
            className="bg-background w-32"
          />
        </div>
      )}
    </div>
  );
}
