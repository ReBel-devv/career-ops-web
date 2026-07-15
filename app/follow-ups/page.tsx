import type { Metadata } from "next";
import { FollowUpsView } from "@/components/follow-ups/follow-ups-view";

export const metadata: Metadata = { title: "Follow-ups" };

export default function FollowUpsPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <FollowUpsView />
    </div>
  );
}
