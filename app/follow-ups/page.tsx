import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Follow-ups" };

export default function FollowUpsPage() {
  return (
    <PlaceholderPage
      title="Follow-ups"
      description="Calendar and overdue list driven by followup-cadence.mjs, with reschedule and log-sent write-backs."
      milestone="M4"
    />
  );
}
