import { expect, test, type Page } from "@playwright/test";

/**
 * Dark + light screenshots of every screen (M7 theme verification). Output
 * lands in e2e/screenshots/ (gitignored) for eyeballing — not pixel-diffed,
 * so theme drift never breaks CI, it just gets captured.
 */

const SCREENS: Array<{ name: string; path: string; ready: (page: Page) => Promise<void> }> = [
  { name: "board", path: "/", ready: async (p) => { await p.getByText("Nimbus Labs").first().waitFor(); } },
  { name: "applications", path: "/applications", ready: async (p) => { await p.getByText("Halcyon Grid").first().waitFor(); } },
  { name: "detail", path: "/app/1", ready: async (p) => { await p.getByText("Machine summary").waitFor(); } },
  { name: "follow-ups", path: "/follow-ups", ready: async (p) => { await p.locator("section[aria-label='Overdue follow-ups']").waitFor(); } },
  { name: "analytics", path: "/analytics", ready: async (p) => { await p.getByText(/Funnel/i).first().waitFor(); } },
  { name: "discovery", path: "/discovery", ready: async (p) => { await p.getByText(/Pending/i).first().waitFor(); } },
  { name: "settings", path: "/settings", ready: async (p) => { await p.getByText(/Demo mode/i).first().waitFor(); } },
];

for (const theme of ["dark", "light"] as const) {
  test.describe(`screenshots — ${theme}`, () => {
    test.use({ colorScheme: theme });

    for (const screen of SCREENS) {
      test(`${screen.name} (${theme})`, async ({ page }) => {
        await page.goto(screen.path);
        await screen.ready(page);
        await page.waitForTimeout(400); // settle charts/motion
        await page.screenshot({
          path: `e2e/screenshots/${theme}-${screen.name}.png`,
          fullPage: true,
        });
        expect(true).toBe(true);
      });
    }
  });
}
