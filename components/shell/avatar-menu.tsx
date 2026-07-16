"use client";

import Link from "next/link";
import { FileText, Settings, Sparkles, User, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClientConfig } from "@/components/providers/app-providers";

/**
 * Avatar menu (top-right) — the route to Profile and Settings on every
 * breakpoint. Kept out of the primary nav so the mobile tab bar stays at 5.
 */
export function AvatarMenu() {
  const { assistantEnabled } = useClientConfig();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Account menu"
      >
        <User className="size-4.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {assistantEnabled ? (
          <>
            <DropdownMenuItem asChild>
              <Link href="/assistant">
                <Sparkles aria-hidden />
                Assistant
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound aria-hidden />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/documents">
            <FileText aria-hidden />
            CVs &amp; Letters
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
