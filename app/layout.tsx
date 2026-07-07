import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "sonner";
import { getConfig } from "@/lib/config";
import { AppProviders } from "@/components/providers/app-providers";
import { CommandPalette } from "@/components/command/command-palette";
import { NavRail } from "@/components/shell/nav-rail";
import { StatsHeader } from "@/components/shell/stats-header";
import { TabBar } from "@/components/shell/tab-bar";

export const metadata: Metadata = {
  title: {
    default: "Career Ops",
    template: "%s · Career Ops",
  },
  description: "Dashboard for the career-ops job search pipeline",
};

export default function RootLayout({
  children,
  drawer,
}: Readonly<{
  children: React.ReactNode;
  /** Parallel slot for the intercepted application-detail drawer (M3). */
  drawer?: React.ReactNode;
}>) {
  const config = getConfig();
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppProviders config={{ readOnly: config.readOnly, demoMode: config.demoMode }}>
          <div className="flex min-h-dvh">
            <NavRail />
            <div className="flex min-w-0 flex-1 flex-col">
              <StatsHeader />
              {/* pb clears the mobile bottom tab bar */}
              <main className="min-w-0 flex-1 pb-20 md:pb-6">{children}</main>
            </div>
          </div>
          <TabBar />
          {drawer}
          {/* useSearchParams inside the palette needs a Suspense boundary. */}
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        </AppProviders>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
