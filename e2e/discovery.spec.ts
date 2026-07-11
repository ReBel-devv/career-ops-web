import { expect, test } from "@playwright/test";

/**
 * Discovery + manual offer add (demo, in-memory). The dashboard queues an
 * un-scannable offer (URL + pasted JD) into the pipeline inbox; it never
 * evaluates or submits anything.
 */

test("add a manual offer from Discovery → it lands in the pending inbox", async ({
  page,
}) => {
  await page.goto("/discovery");
  await page.getByRole("link", { name: "Add offer" }).click();
  await expect(page).toHaveURL(/\/discovery\/add$/);

  const url =
    "https://www.welcometothejungle.com/fr/companies/acme/jobs/frontend-engineer-e2e";
  await page.getByLabel("Job posting URL").fill(url);
  await page
    .getByLabel("Job description")
    .fill("We are hiring a Frontend Engineer — React, TypeScript, Tailwind, motion.");
  await page.getByRole("button", { name: "Add to pipeline" }).click();

  // Success panel names the saved JD file + the queue-only reminder.
  await expect(page.getByText("Added to the pipeline inbox").first()).toBeVisible();
  await expect(page.getByText(/career-ops pipeline/).first()).toBeVisible();

  // Back to Discovery → the offer is in Pending, marked "manual".
  await page.getByRole("link", { name: "Back to Discovery" }).click();
  await expect(page).toHaveURL(/\/discovery$/);
  const pending = page.locator("section[aria-label='Pending URLs']");
  await expect(pending.getByText("manual").first()).toBeVisible();
  await expect(
    pending.getByText("welcometothejungle.com/fr/companies/acme/jobs/frontend-engineer-e2e"),
  ).toBeVisible();
});

test("the add form validates URL and JD before submitting", async ({ page }) => {
  await page.goto("/discovery/add");
  // Empty submit → both fields flag inline errors, nothing is queued.
  await page.getByRole("button", { name: "Add to pipeline" }).click();
  await expect(page.getByText("Enter a valid URL")).toBeVisible();
  await expect(page.getByText("Paste the job description")).toBeVisible();
  await expect(page.getByText("Added to the pipeline inbox")).toHaveCount(0);
});
