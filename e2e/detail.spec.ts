import { expect, test } from "@playwright/test";

/**
 * Application detail (F2) + demo writes: drawer over the board, report zones,
 * notes save (in-memory, Decision 6), documents (generated placeholder PDFs),
 * and the outreach stage stepper (F7).
 */

test("clicking a card opens the detail drawer over the board", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Nimbus Labs/ }).first().click();
  // Intercepted route renders the drawer (Sheet dialog) on client-side nav.
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Nimbus Labs" })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/1$/);
  // Report zones light up from the fixture report.
  await expect(drawer.getByText("Machine summary")).toBeVisible();
  await expect(drawer.getByText("Design Engineer (UI/Motion)").first()).toBeVisible();
  await expect(drawer.getByText("Score breakdown")).toBeVisible();
});

test("deep link renders the full detail page with all report zones", async ({ page }) => {
  await page.goto("/app/12");
  await expect(page.getByRole("heading", { name: "Halcyon Grid" })).toBeVisible();
  await expect(page.getByText("Machine summary")).toBeVisible();
  await expect(page.getByText(/best-fit posting of the current batch/)).toBeVisible();
  // Score Global table parsed from the fixture report.
  await expect(page.getByText("Score breakdown")).toBeVisible();
  await expect(page.getByRole("cell", { name: "North Star alignment" })).toBeVisible();
  // Full report accordion (Blocks A–G, letter chips + stripped titles).
  await expect(page.getByText("Full report")).toBeVisible();
  const roleSummary = page.getByRole("button", { name: /Role Summary/ });
  await expect(roleSummary).toBeVisible();
  await roleSummary.click(); // expand block A → its prose renders
  await expect(page.getByText("Detected archetype").first()).toBeVisible();
});

test("notes editing writes in-memory and toasts (demo write)", async ({ page }) => {
  await page.goto("/app/5");
  const notes = page.getByRole("textbox", { name: "Notes for #5" });
  await expect(notes).toBeVisible();
  const marker = `e2e note ${Date.now()}`;
  await notes.fill(marker);
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes for #5 saved")).toBeVisible();
  // The write is reflected on reload of the same server session.
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Notes for #5" })).toHaveValue(marker);
});

test("documents zone links the generated placeholder PDF", async ({ page }) => {
  await page.goto("/app/1");
  const cvLink = page.getByRole("link", { name: /demo-cv-nimbus-labs\.pdf/ });
  await expect(cvLink).toBeVisible();
  const response = await page.request.get("/api/files/pdf/demo-cv-nimbus-labs.pdf");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("interview-prep files render for a matching application", async ({ page }) => {
  await page.goto("/app/26"); // Emberfield, Interview — has a demo prep file
  await expect(page.getByRole("heading", { name: "Emberfield", exact: true })).toBeVisible();
  await expect(page.getByText("Interview prep")).toBeVisible();
  const prep = page.getByRole("button", {
    name: /emberfield-ui-engineer-motion\.md/,
  });
  await expect(prep).toBeVisible();
  await prep.click(); // expand → the markdown renders
  await expect(page.getByText("Likely questions")).toBeVisible();
});

test("outreach stepper advances a contact stage with undo", async ({ page }) => {
  await page.goto("/app/1");
  await expect(page.getByText("Maya Lindqvist")).toBeVisible();
  // Current stage is "messaged"; advance to "replied" via the stepper button.
  const stepper = page.getByRole("list", { name: /Outreach stage for Maya Lindqvist/ });
  await stepper.getByRole("button", { name: "Set stage to Replied" }).click();
  await expect(page.getByText("Maya Lindqvist → replied")).toBeVisible();
  // Undo restores the previous stage (Decision 5 pattern).
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("list", { name: /Outreach stage for Maya Lindqvist: Messaged/ }),
  ).toBeVisible();
});

test("outreach add + remove round-trips in memory", async ({ page }) => {
  await page.goto("/app/5");
  await page.getByRole("button", { name: "Add contact" }).click();
  const dialog = page.getByRole("dialog", { name: "Add contact" });
  await dialog.getByPlaceholder("Full name").fill("Test Peer");
  await dialog.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText(/Contact Test Peer added/)).toBeVisible();
  await expect(page.getByText("Test Peer", { exact: true })).toBeVisible();

  // Remove (destructive placement inside the edit dialog).
  await page.getByRole("button", { name: "Edit contact Test Peer" }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Contact removed")).toBeVisible();
});
