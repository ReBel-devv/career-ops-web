import { expect, test } from "@playwright/test";

/**
 * Follow-ups (F6) in demo mode: dynamic-offset cadence (never stale), overdue
 * pinned on top, reschedule + log-sent demo writes.
 */

test("follow-ups shows overdue on top and a month calendar", async ({ page }) => {
  await page.goto("/follow-ups");
  const overdue = page.locator("section[aria-label='Overdue follow-ups']");
  await expect(overdue).toBeVisible();
  // Fixture seeds guarantee overdue entries regardless of the current date.
  await expect(overdue.getByText("Vectorline")).toBeVisible();
  await expect(page.locator("section[aria-label='Follow-up calendar']")).toBeVisible();
});

test("reschedule pins a new date in memory and updates the entry", async ({ page }) => {
  await page.goto("/follow-ups");
  await page
    .getByRole("button", { name: "Reschedule follow-up for #2 Vectorline" })
    .click();
  const nextWeek = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
  await page.locator("#rs-2").fill(nextWeek);
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(page.getByText(`Follow-up rescheduled to ${nextWeek}`)).toBeVisible();
  // Overdue section no longer lists Vectorline (pin moved it to upcoming).
  await expect(
    page.locator("section[aria-label='Overdue follow-ups']").getByText("Vectorline"),
  ).toHaveCount(0);
});

test("log sent appends an in-memory follow-up row", async ({ page }) => {
  await page.goto("/follow-ups");
  await page
    .getByRole("button", { name: "Log a sent follow-up for #14 Windrose Software" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Log follow-up" }).click();
  await expect(page.getByText(/Follow-up logged for /)).toBeVisible();
});

test("stats header shows follow-ups due from the cadence", async ({ page }) => {
  await page.goto("/");
  const stats = page.locator("[aria-label='Pipeline stats']");
  await expect(stats.getByText(/Follow-ups due/i)).toBeVisible();
});
