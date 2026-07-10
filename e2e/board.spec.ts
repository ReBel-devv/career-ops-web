import { expect, test, type Page } from "@playwright/test";

/**
 * Board (F1) in demo mode: rendering, mouse drag, the keyboard paths
 * (dnd-kit KeyboardSensor drag AND the Move-to-status menu mirror), and
 * URL-param filters (F4).
 *
 * Every mutating test restores the demo state via the Undo toast, so specs
 * stay order-independent on the single shared in-memory server.
 */

function column(page: Page, label: string) {
  return page.locator(`section[aria-label*='${label} column']`);
}

function draggableCard(page: Page, columnLabel: string, company: string) {
  // The card root carries the pointer-drag listeners (no interactive role —
  // the ARIA drag surface is the per-card handle button).
  return column(page, columnLabel)
    .locator("[class*='group/card']")
    .filter({ hasText: company })
    .first();
}

async function openBoard(page: Page) {
  await page.goto("/");
  await expect(column(page, "Evaluated").first()).toBeVisible();
}

test("board renders demo columns with cards and live stats", async ({ page }) => {
  await openBoard(page);

  // Active (non-archived) columns visible by default.
  for (const label of ["Evaluated", "Applied", "Responded", "Interview", "Offer"]) {
    await expect(column(page, label)).toBeVisible();
  }
  // Archived hidden by default (Decision 8).
  await expect(column(page, "Rejected")).toHaveCount(0);

  // Fictional cards render.
  await expect(page.getByText("Nimbus Labs").first()).toBeVisible();
  await expect(page.getByText("Halcyon Grid").first()).toBeVisible();

  // Stats header shows live demo numbers.
  await expect(page.locator("[aria-label='Pipeline stats']")).toBeVisible();
});

test("mouse drag moves a card to another column with an undo toast", async ({ page }) => {
  await openBoard(page);

  const card = draggableCard(page, "Evaluated", "Quartzworks");
  await expect(card).toBeVisible();
  const target = column(page, "Applied");

  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("missing bounding boxes");

  // Grab the card's lower region (below the company link) and travel in steps
  // so the PointerSensor's 6px activation + tracking both engage. Release only
  // once dnd-kit itself announces the target column (what a user sees via the
  // droppable highlight) — collision is overlay-rect-based, not pointer-based,
  // so a fixed drop coordinate is not deterministic.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height - 8);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height - 4, { steps: 3 });
  const live = page.locator("[aria-live='assertive']").first();
  let over = false;
  for (let x = from.x + 60; x <= to.x + to.width && !over; x += 40) {
    await page.mouse.move(x, to.y + 160, { steps: 4 });
    await page.waitForTimeout(100);
    over = ((await live.textContent()) ?? "").includes("Over Applied column");
  }
  expect(over).toBe(true);
  await page.mouse.up();

  // Optimistic move lands in the Applied column + success toast with Undo.
  await expect(column(page, "Applied").getByText("Quartzworks")).toBeVisible();
  await expect(page.getByText(/Quartzworks → Applied/)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(column(page, "Evaluated").getByText("Quartzworks")).toBeVisible();
});

test("keyboard drag (dnd-kit sensor) picks up and drops a card", async ({ page }) => {
  await openBoard(page);

  // The keyboard drag surface is the card's dedicated handle button.
  const handle = page.getByRole("button", { name: "Drag #13 Brightgale" });
  await expect(handle).toBeVisible();

  await handle.focus();
  await page.keyboard.press("Space"); // pick up

  // Arrow right until the live region announces the Applied column, then drop.
  // (Keyboard moves are 25px steps — polling the announcement is deterministic
  // where a fixed press count is not.)
  const live = page.locator("[aria-live='assertive']").first();
  let over = false;
  for (let i = 0; i < 15 && !over; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(80);
    over = ((await live.textContent()) ?? "").includes("Over Applied column");
  }
  expect(over).toBe(true);
  await page.keyboard.press("Space"); // drop

  await expect(page.getByText(/#13 Brightgale → Applied/)).toBeVisible();
  await expect(column(page, "Applied").getByText("Brightgale")).toBeVisible();

  // Restore via undo to keep the shared demo server predictable.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(column(page, "Evaluated").getByText("Brightgale")).toBeVisible();
});

test("move-to-status menu is the keyboard-operable mirror of drag", async ({ page }) => {
  await openBoard(page);

  await page
    .getByRole("button", { name: "Move #9 Meridian Labs to another status", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Applied" }).click();
  await expect(page.getByText(/Meridian Labs → Applied/)).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(column(page, "Evaluated").getByText("Meridian Labs")).toBeVisible();
});

test("URL filters compose and round-trip through the filter bar (F4)", async ({ page }) => {
  // Deep link with a query param filters the board.
  await page.goto("/?q=halcyon");
  await expect(column(page, "Applied").getByText("Halcyon Grid")).toBeVisible();
  await expect(page.getByText("Nimbus Labs")).toHaveCount(0);

  // Typing in the search box updates the URL (shareable state).
  const search = page.getByRole("searchbox", { name: "Search applications" });
  await search.fill("emberfield");
  await expect(page).toHaveURL(/q=emberfield/);
  await expect(column(page, "Interview").getByText("Emberfield")).toBeVisible();
  await expect(page.getByText("Halcyon Grid")).toHaveCount(0);

  // Score filter composes with AND: raise min above Emberfield's 4.3 → empty.
  await page.goto("/?q=emberfield&smin=4.4");
  await expect(page.getByText("Emberfield")).toHaveCount(0);
});
