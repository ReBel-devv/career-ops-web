"use client";

import Link from "next/link";
import { Settings, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Avatar menu — on mobile this is the only route to Settings (plan §2). */
export function AvatarMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Account menu"
      >
        <User className="size-4.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
