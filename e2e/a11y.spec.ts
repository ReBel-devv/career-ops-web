import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * axe-core WCAG 2.x A/AA scan of every main screen, in BOTH themes (plan §6:
 * WCAG AA dark and light). Any violation fails with a readable dump.
 */

const SCREENS: Array<{ path: string; ready: (page: Page) => Promise<void> }> = [
  { path: "/", ready: async (p) => { await p.getByText("Nimbus Labs").first().waitFor(); } },
  { path: "/applications", ready: async (p) => { await p.getByText("Halcyon Grid").first().waitFor(); } },
  { path: "/app/1", ready: async (p) => { await p.getByText("Machine summary").waitFor(); } },
  { path: "/follow-ups", ready: async (p) => { await p.locator("section[aria-label='Overdue follow-ups']").waitFor(); } },
  { path: "/analytics", ready: async (p) => { await p.getByText(/Funnel/i).first().waitFor(); } },
  { path: "/discovery", ready: async (p) => { await p.getByText(/Pending/i).first().waitFor(); } },
  { path: "/discovery/add", ready: async (p) => { await p.getByLabel("Job posting URL").waitFor(); } },
  { path: "/settings", ready: async (p) => { await p.getByText(/Demo mode/i).first().waitFor(); } },
];

for (const theme of ["dark", "light"] as const) {
  test.describe(`axe — ${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const screen of SCREENS) {
      test(`${screen.path} has no WCAG A/AA violations`, async ({ page }) => {
        await page.goto(screen.path);
        await screen.ready(page);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const readable = results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 3).map((n) => n.html),
        }));
        expect(readable, JSON.stringify(readable, null, 2)).toEqual([]);
      });
    }
  });
}
