import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage() {
  return (
    <PlaceholderPage
      title="Board"
      description="Kanban across the 8 canonical states, with drag-to-move write-back. Until then, the Applications table is the live view."
      milestone="M2"
    />
  );
}
