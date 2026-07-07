"use client";

import { useState } from "react";
import { CalendarClock, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFollowUpActions } from "@/lib/client/queries";
import { useMutationsEnabled } from "@/components/providers/app-providers";
import type { CadenceEntry } from "@/lib/domain";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Reschedule (append a pin) + Log-sent (append a row) for one follow-up. */
export function FollowUpActions({ entry }: { entry: CadenceEntry }) {
  const enabled = useMutationsEnabled();
  const { reschedule, logSent, isPending } = useFollowUpActions();

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [date, setDate] = useState(entry.nextFollowupDate ?? todayISO());

  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState(todayISO());
  const [channel, setChannel] = useState("email");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");

  if (!enabled) return null;

  return (
    <div className="flex items-center gap-1">
      <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            aria-label={`Reschedule follow-up for #${entry.num} ${entry.company}`}
          >
            <CalendarClock className="size-3.5" aria-hidden />
            Reschedule
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" align="end">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`rs-${entry.num}`}>
              Next follow-up date
            </label>
            <Input
              id={`rs-${entry.num}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-data"
            />
            <Button
              size="sm"
              disabled={isPending || !date}
              onClick={() => {
                reschedule(entry.num, date);
                setRescheduleOpen(false);
              }}
            >
              <Check className="size-3.5" aria-hidden />
              Reschedule
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            aria-label={`Log a sent follow-up for #${entry.num} ${entry.company}`}
          >
            <Send className="size-3.5" aria-hidden />
            Log sent
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log a sent follow-up</DialogTitle>
            <DialogDescription>
              #{String(entry.num).padStart(3, "0")} {entry.company} — {entry.role}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Field label="Date">
              <Input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="text-data"
              />
            </Field>
            <Field label="Channel">
              <Input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="email"
                className="text-data"
              />
            </Field>
            <Field label="Contact (optional)">
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Recruiter name / email"
                className="text-data"
              />
            </Field>
            <Field label="Notes (optional)">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="What did you say?"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setLogOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isPending || !logDate}
                onClick={() => {
                  logSent(entry.num, {
                    date: logDate,
                    channel,
                    contact: contact || undefined,
                    notes: notes || undefined,
                  });
                  setLogOpen(false);
                  setContact("");
                  setNotes("");
                }}
              >
                <Send className="size-3.5" aria-hidden />
                Log follow-up
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
