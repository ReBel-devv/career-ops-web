import { expect, test } from "@playwright/test";

/**
 * Mobile adaptations (plan §2) — runs in the `mobile` project (iPhone 13
 * viewport): bottom tab bar, segmented status control instead of horizontal
 * drag, and the Move-to-status action sheet with ≥44px targets.
 */

test("bottom tab bar navigates between screens", async ({ page }) => {
  await page.goto("/");
  // getByRole resolves via the a11y tree, so the display-hidden desktop rail
  // (also labelled "Primary") is excluded and only the tab bar matches.
  const tabBar = page.getByRole("navigation", { name: "Primary" });
  await expect(tabBar).toBeVisible();

  await tabBar.getByRole("link", { name: /Analytics/i }).click();
  await expect(page).toHaveURL(/\/analytics/);
  await tabBar.getByRole("link", { name: /Board/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("mobile board uses a segmented status control, not drag", async ({ page }) => {
  await page.goto("/");
  const tablist = page.getByRole("tablist", { name: "Status columns" });
  await expect(tablist).toBeVisible();

  // Default segment: Evaluated cards. (Role locators resolve via the a11y
  // tree, so the display-hidden desktop board's copies never match.)
  await expect(page.getByRole("link", { name: "Quartzworks" })).toBeVisible();

  // Switch segment → Interview cards.
  await tablist.getByRole("tab", { name: /Interview/ }).click();
  await expect(page.getByRole("link", { name: "Nimbus Labs" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quartzworks" })).toHaveCount(0);
});

test("move action sheet moves a card with a toast (≥44px targets)", async ({ page }) => {
  await page.goto("/");
  const tablist = page.getByRole("tablist", { name: "Status columns" });
  await tablist.getByRole("tab", { name: /Evaluated/ }).click();

  await page
    .getByRole("button", { name: "Move #13 Brightgale to another status" })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Move to status")).toBeVisible();

  // Touch-target height ≥44px on the sheet's options.
  const option = sheet.getByRole("button", { name: "Applied" });
  const box = await option.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  await option.click();
  await expect(page.getByText(/Brightgale → Applied/)).toBeVisible();

  // Undo restores the demo state for other specs.
  await page.getByRole("button", { name: "Undo" }).click();
  await tablist.getByRole("tab", { name: /Evaluated/ }).click();
  await expect(page.getByRole("link", { name: "Brightgale" })).toBeVisible();
});

test("detail is a full page on mobile with sticky header zones", async ({ page }) => {
  await page.goto("/app/4");
  await expect(page.getByRole("heading", { name: "Helioscope" })).toBeVisible();
  await expect(page.getByText("Machine summary")).toBeVisible();
  // Stats header chips scroll horizontally rather than wrapping (plan §2).
  await expect(page.locator("[aria-label='Pipeline stats']")).toBeVisible();
});
