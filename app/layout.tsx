import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "sonner";
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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="flex min-h-dvh">
          <NavRail />
          <div className="flex min-w-0 flex-1 flex-col">
            <StatsHeader />
            {/* pb clears the mobile bottom tab bar */}
            <main className="min-w-0 flex-1 pb-20 md:pb-6">{children}</main>
          </div>
        </div>
        <TabBar />
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
