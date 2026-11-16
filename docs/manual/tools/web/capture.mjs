// Takes the web screenshots for the user manual (docs/manual/img/), from the
// portals' demo mode, and compresses them. See README.md beside this file.
//
//   node docs/manual/tools/web/capture.mjs [--base http://localhost:3100] [--only ID,ID|PREFIX]
//
// Every portal row runs in demo mode, where the browser answers /api/* itself.
// Any /api request that still reaches the network is blocked, logged, and
// fails the run.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const WEB = path.join(ROOT, "web");
const IMG = path.join(ROOT, "docs/manual/img");

const { chromium } = await import(pathToFileURL(path.join(WEB, "node_modules/playwright/index.mjs")).href);
const sharp = createRequire(path.join(WEB, "package.json"))("sharp");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("--base", "http://localhost:3100").replace(/\/$/, "");
// The address the browser shows. Pages that print their own address (the
// student web app, the app link) then read as the live site, while every
// request is answered by the local server at BASE.
const SITE = opt("--site", "https://www.i-care.dev").replace(/\/$/, "");
const ONLY = (opt("--only", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const HEADED = args.includes("--headed");

// Monday 16 November 2026, 9:30 AM in Manila: greetings, the header clock and
// the demo's relative dates agree in every shot.
const CLOCK = new Date("2026-11-16T09:30:00+08:00");
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const PAD = 16;
const MAX_BYTES = 600 * 1024;

/** The demo-only notifications the real app never sends. */
const DEMO_ONLY_NOTES = ["Welcome to the iCARE++ demo", "Test run finished"];

/**
 * The manual names only the people on its own list. The demo's one account
 * request comes from someone else, so it reads as Lorna Dizon, who asks for
 * an account in the setup guide.
 */
const NAME_SWAPS = [
  ["teresa.gomez@demo.icare.ph", "lorna.dizon@example.com"],
  ["Teresa Gomez", "Lorna Dizon"],
];

const ADMIN_VIEWER = {
  id: "d0000001-0000-4000-8000-000000000001",
  email: "admin@demo.icare.ph",
  name: "Andrea Villanueva",
  role: "super_admin",
  admin_title: null,
  picture_url: null,
  sex: "female",
  has_password: true,
  google_linked: false,
  force_password_change: false,
};

// ---------------------------------------------------------------------------
// Browser and page helpers
// ---------------------------------------------------------------------------

let browser;
const leaks = [];

async function openPage(row) {
  const viewport = row.viewport ?? DESKTOP;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
    locale: "en-US",
    timezoneId: "Asia/Manila",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.clock.setFixedTime(CLOCK);
  // Everything for SITE is fetched from BASE; nothing goes to the real site.
  await context.route(`${SITE}/**`, async (route) => {
    const url = BASE + route.request().url().slice(SITE.length);
    // The error reporter's tunnel would pass these sessions on to the
    // project's real Sentry; answer it here instead.
    if (new URL(url).pathname.startsWith("/monitoring")) return route.fulfill({ status: 200, body: "" });
    try {
      const response = await route.fetch({ url, maxRedirects: 0 });
      const headers = response.headers();
      if (headers.location) headers.location = headers.location.split(BASE).join(SITE);
      await route.fulfill({ response, headers });
    } catch {
      await route.abort().catch(() => {});
    }
  });
  // Demo rows must never reach the API. Public rows (the sign-in and contact
  // pages) may ask the local server for nothing more than its build id.
  await context.route("**/api/**", (route) => {
    const req = route.request();
    if (!row.role) return route.fallback();
    leaks.push(`${row.id}: ${req.method()} ${new URL(req.url()).pathname}`);
    return route.abort();
  });
  // The demo greets every visitor with notifications the real app never
  // sends; leave them out of what the page reads, so counts match real use.
  await context.addInitScript(({ titles, swaps }) => {
    const json = Response.prototype.json;
    Response.prototype.json = async function () {
      let data = await json.call(this);
      if (data && typeof data === "object") {
        let text = JSON.stringify(data);
        if (swaps.some(([from]) => text.includes(from))) {
          for (const [from, to] of swaps) text = text.split(from).join(to);
          data = JSON.parse(text);
        }
      }
      if (data && Array.isArray(data.notifications)) {
        data.notifications = data.notifications.filter((n) => !titles.includes(n.title));
        if (typeof data.unread === "number") data.unread = data.notifications.filter((n) => !n.read_at).length;
      }
      return data;
    };
  }, { titles: DEMO_ONLY_NOTES, swaps: NAME_SWAPS });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log(`  [${row.id}] page error: ${err.message.slice(0, 160)}`));
  return { context, page };
}

const DEMO_LABEL = { faculty: "Instructor", dean: "Dean", pc: "Program Chair" };

/** Starts the role's demo the way a visitor does. */
async function startDemo(page, role) {
  await page.goto(`${SITE}/login`);
  if (role === "admin") {
    // The picker offers no Admin demo: set what startDemo() sets.
    await page.evaluate((viewer) => {
      sessionStorage.removeItem("icare_demo_store");
      localStorage.setItem("icare_demo", "super_admin");
      localStorage.setItem("icare_user", JSON.stringify(viewer));
      localStorage.setItem("icare_token", "logged_in");
      document.cookie = "icare_demo=super_admin; path=/; SameSite=Lax";
    }, ADMIN_VIEWER);
    await page.goto(`${SITE}/admin`);
  } else {
    await page.getByRole("button", { name: /try a demo/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${DEMO_LABEL[role]}`) }).click();
    await page.waitForURL(/\/(instructor|dean|admin)(\/|$)/, { timeout: 30_000 });
  }
  await settle(page);
}

/** Navigates within the demo with a full load, then waits for the page to settle. */
async function go(page, route) {
  await page.goto(`${SITE}${route}`);
  await settle(page);
}

/** Waits until no skeleton or loader is on screen, then dismisses toasts. */
async function settle(page, { quiet = 600, timeout = 20_000 } = {}) {
  await page.waitForLoadState("load");
  const start = Date.now();
  let calmSince = null;
  while (Date.now() - start < timeout) {
    const busy = await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 40 && r.height > 10 && r.bottom > 0 && r.top < innerHeight;
      };
      const pulses = [...document.querySelectorAll(".animate-pulse")].filter(visible).length;
      const loaders = [...document.querySelectorAll("[aria-busy='true'], svg.ecg-loader, [data-ecg-loader]")].filter(visible).length;
      return pulses + loaders;
    });
    if (busy === 0) {
      calmSince ??= Date.now();
      if (Date.now() - calmSince >= quiet) break;
    } else {
      calmSince = null;
    }
    await page.waitForTimeout(150);
  }
  await dismissToasts(page);
}

async function dismissToasts(page) {
  for (let i = 0; i < 5; i++) {
    const buttons = page.locator('[role="status"] button[aria-label="Dismiss"]');
    const n = await buttons.count();
    if (n === 0) break;
    await buttons.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** Grows the viewport (width kept) so a tall element fits, and scrolls it into view. */
async function fitHeight(page, locator, extra = PAD * 2) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element not visible");
  const vp = page.viewportSize();
  if (box.height + extra > vp.height) {
    await page.setViewportSize({ width: vp.width, height: Math.ceil(box.height + extra + 40) });
    await page.waitForTimeout(400);
  }
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
}

/** The union of the boxes, plus PAD on each side, clipped to the viewport. */
async function clipOf(page, locators, pad = PAD) {
  const boxes = [];
  for (const l of locators) {
    const b = await l.boundingBox();
    if (!b) throw new Error("crop element not visible");
    boxes.push(b);
  }
  const vp = page.viewportSize();
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
}

async function save(row, buffer) {
  const out = path.join(IMG, row.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const png = await sharp(buffer).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(out, png);
  const kb = (png.length / 1024).toFixed(0);
  if (png.length > MAX_BYTES) console.log(`  ! ${row.file} is ${kb} KB, over the 600 KB limit`);
  console.log(`  wrote ${row.file} (${kb} KB)`);
}

/** Takes focus off any field, so no focus ring shows. */
async function blur(page) {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
}

const shot = {
  /** The whole viewport. */
  async viewport(page, row) {
    await dismissToasts(page);
    await blur(page);
    await save(row, await page.screenshot());
  },
  /** One or more elements, PAD around their union. */
  async of(page, row, locators, pad = PAD) {
    await dismissToasts(page);
    await blur(page);
    const list = Array.isArray(locators) ? locators : [locators];
    await fitHeight(page, list[0]);
    await save(row, await page.screenshot({ clip: await clipOf(page, list, pad) }));
  },
  /** A fixed rectangle. */
  async clip(page, row, clip) {
    await dismissToasts(page);
    await blur(page);
    await save(row, await page.screenshot({ clip }));
  },
};

/** The visible dialog card (not its backdrop). */
function dialog(page, name) {
  const d = page.locator('[role="dialog"]:visible');
  return name ? d.filter({ hasText: name }).last() : d.last();
}

/** The Shell's own scroll container: everything right of the sidebar. */
function scroller(page) {
  return page.locator("div.custom-scrollbar.overflow-y-auto.h-full").first();
}

/** The page area right of the sidebar, as a rectangle. */
async function mainArea(page) {
  const box = await scroller(page).boundingBox();
  const vp = page.viewportSize();
  return { x: Math.round(box.x), y: 0, width: Math.round(vp.width - box.x), height: vp.height };
}

/** Sidebar top (brand and bell) plus the open notifications popover. */
async function bellPopover(page, row) {
  await page.getByRole("button", { name: /^Notifications/ }).first().click();
  const pop = page.getByRole("dialog", { name: "Notifications" });
  await pop.waitFor();
  await page.waitForTimeout(500);
  const brand = page.locator("aside").first();
  const aside = await brand.boundingBox();
  const p = await pop.boundingBox();
  const x0 = Math.max(0, aside.x);
  const y0 = 0;
  const x1 = Math.min(page.viewportSize().width, p.x + p.width + PAD);
  const y1 = Math.min(page.viewportSize().height, p.y + p.height + PAD);
  await shot.clip(page, row, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
}

/**
 * The card holding every given element: their closest common ancestor, then
 * up to the first one drawn as a card (a border or a shadow).
 */
let cardSeq = 0;
async function cardAround(page, ...locators) {
  const handles = [];
  for (const l of locators) handles.push(await l.first().elementHandle());
  const tag = `c${++cardSeq}`;
  await page.evaluate(
    ([tagValue, ...els]) => {
      let a = els[0];
      while (a && !els.every((e) => a.contains(e))) a = a.parentElement;
      const drawn = (el) => {
        const cs = getComputedStyle(el);
        return parseFloat(cs.borderTopWidth) > 0 || (cs.boxShadow && cs.boxShadow !== "none");
      };
      while (a && a.parentElement && !drawn(a)) a = a.parentElement;
      a.setAttribute("data-capture", tagValue);
    },
    [tag, ...handles],
  );
  return page.locator(`[data-capture="${tag}"]`);
}

/** The closest ancestor card of a piece of text. */
function cardOf(page, text, cls = "rounded-") {
  return page
    .getByText(text, { exact: true })
    .first()
    .locator(`xpath=ancestor::*[contains(@class,'${cls}')][1]`);
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const ROWS = [];
const row = (id, file, role, run, extra = {}) => ROWS.push({ id, file, role, run, ...extra });

// --- setup (signed out) -----------------------------------------------------

row("SET-01", "setup/01-web-sign-in.png", null, async (page, r) => {
  await go(page, "/login");
  await page.waitForTimeout(1500); // the card's entrance and Google's script
  await shot.of(page, r, page.locator("div.rounded-3xl", { has: page.getByText("Welcome back, caregiver") }));
});

row("SET-02", "setup/02-contact-us.png", null, async (page, r) => {
  await go(page, "/signup");
  await page.getByPlaceholder("Your name").fill("Lorna Dizon");
  await page.getByPlaceholder("you@email.com").fill("lorna.dizon@example.com");
  await page.locator("label", { hasText: /^Female$/ }).click();
  await page.locator("#message").fill(
    "I am a new clinical instructor at the College of Nursing and need an Instructor account.",
  );
  await page.locator("#message").blur();
  await page.waitForTimeout(400);
  // Never select Send request: this page is real and would email the team.
  await shot.of(page, r, page.locator("div.rounded-3xl", { has: page.getByText("Contact us", { exact: true }) }));
});

row("SET-03", "setup/03-try-a-demo.png", null, async (page, r) => {
  await go(page, "/login");
  await page.getByRole("button", { name: /try a demo/i }).click();
  const d = page.getByRole("dialog");
  await d.waitFor();
  await page.waitForTimeout(500);
  await shot.of(page, r, d);
});

// --- common (Instructor demo) -------------------------------------------------

row("COM-01", "common/01-portal-layout.png", "faculty", async (page, r) => {
  await shot.viewport(page, r);
});

row(
  "COM-02",
  "common/02-phone-navigation.png",
  "faculty",
  async (page, r) => {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.waitForTimeout(700);
    await shot.viewport(page, r);
  },
  { viewport: PHONE },
);

row("COM-03", "common/03-notifications-popover.png", "faculty", async (page, r) => {
  await bellPopover(page, r);
});

row("COM-04", "common/04-notifications-page.png", "faculty", async (page, r) => {
  await page.getByRole("button", { name: /^Notifications/ }).first().click();
  await page.getByRole("button", { name: /See all notifications/ }).click();
  await page.waitForURL(/\/instructor\/notifications/);
  await settle(page);
  // The demo has no live feed, so the status pill on the filter row reads
  // "Reconnecting"; a real session reads "Live". Hidden, keeping its space.
  await page.addStyleTag({ content: 'span[title="Reconnecting…"], span[title="Updating live"] { visibility: hidden !important; }' });
  const tabs = scroller(page).locator("button", { hasText: /^All$/ }).first();
  const tabsBox = await tabs.boundingBox();
  const area = await mainArea(page);
  // The filter row and the first few notifications, below the subtitle.
  const y0 = Math.round(tabsBox.y - PAD);
  await shot.clip(page, r, { x: area.x, y: y0, width: area.width, height: Math.min(560, DESKTOP.height - y0) });
});

row("COM-05", "common/05-settings-profile.png", "faculty", async (page, r) => {
  await page.locator("aside a", { hasText: "Maria Santos" }).first().click();
  await page.waitForURL(/\/instructor\/settings/);
  await settle(page);
  const banner = page.locator("section", { has: page.getByText("Change photo", { exact: true }) }).first();
  const grid = page.locator("div.grid", { has: page.getByText("Sign-in & security", { exact: true }) }).first();
  await shot.of(page, r, [banner, grid]);
});

row("COM-06", "common/06-change-email.png", "faculty", async (page, r) => {
  await go(page, "/instructor/settings");
  await page.getByRole("button", { name: "Change email" }).click();
  const d = dialog(page);
  await d.waitFor();
  await d.getByPlaceholder("name@example.com").fill("maria.santos.new@example.com");
  await page.waitForTimeout(300);
  await shot.of(page, r, d);
});

row("COM-07", "common/07-change-password.png", "faculty", async (page, r) => {
  await go(page, "/instructor/settings");
  await page.getByRole("link", { name: "Change password" }).click();
  await page.waitForURL(/change-password/);
  await settle(page);
  await shot.of(page, r, cardOf(page, "Change Password", "rounded-"));
});

row("COM-08", "common/08-appearance-caching.png", "faculty", async (page, r) => {
  await go(page, "/instructor/settings");
  const appearance = page.locator("section", { has: page.getByRole("heading", { name: "Appearance" }) }).first();
  const caching = page.locator("section", { has: page.getByRole("heading", { name: "Local caching" }) }).first();
  await caching.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot.of(page, r, [appearance, caching]);
});

row("COM-09", "common/09-log-out.png", "faculty", async (page, r) => {
  await page.getByRole("button", { name: "Log out" }).click();
  const d = page.getByRole("dialog", { name: /log out/i });
  await d.waitFor();
  await page.waitForTimeout(500);
  await shot.of(page, r, d);
});

row("COM-10", "common/10-help-support.png", "faculty", async (page, r) => {
  await go(page, "/instructor/help");
  await page.locator("label", { hasText: "How do I…?" }).click();
  await page.getByPlaceholder("A few words that sum it up").fill("Moving a student to another section");
  await page
    .getByPlaceholder("Tell us what's going on")
    .fill("How do I move a student from BSN 3101 to BSN 3102 before the next ward week?");
  await page.locator("body").click({ position: { x: 1430, y: 5 } });
  await page.waitForTimeout(300);
  await shot.clip(page, r, await mainArea(page));
});

row("COM-11", "common/11-analytics-filter-bar.png", "faculty", async (page, r) => {
  await go(page, "/instructor/analytics");
  await page.getByRole("button", { name: /^Course:/ }).click();
  await page.getByRole("button", { name: /^NCM 101/ }).first().click();
  await settle(page);
  await page.getByRole("button", { name: /^Sections:/ }).click();
  await page.waitForTimeout(400);
  const bar = page.getByText("Sections", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'shadow-tile')][1]");
  const list = page.getByRole("button", { name: "All sections" }).last().locator("xpath=..");
  await shot.of(page, r, [bar, list]);
});

row("COM-12", "common/12-ai-summary.png", "faculty", async (page, r) => {
  await go(page, "/instructor/analytics");
  await page.getByRole("button", { name: /AI Summary/ }).first().click();
  const d = page.getByRole("dialog", { name: /summary/i });
  await d.waitFor();
  await d.getByText("Suggested Actions").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot.of(page, r, d);
});

row("COM-13", "common/13-report-preview.png", "faculty", async (page, r) => {
  await go(page, "/instructor/reports");
  await page.getByRole("button", { name: /^Section/ }).first().click();
  await page.getByText("BSN 3101", { exact: true }).first().click();
  await settle(page);
  await page.getByRole("button", { name: /^Per student/ }).click();
  await settle(page);
  await page.getByRole("button", { name: "Preview Angela Bautista" }).click();
  const d = page.getByRole("dialog");
  await d.locator("iframe").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500); // the PDF viewer draws the first page
  await shot.of(page, r, d);
});

// --- admin (Admin demo) --------------------------------------------------------

/** Picks the option whose text matches, in a native select. */
async function choose(select, pattern) {
  const value = await select.evaluate((el, src) => {
    const re = new RegExp(src);
    const opt = [...el.options].find((o) => re.test(o.textContent.trim()));
    return opt ? opt.value : null;
  }, pattern.source);
  if (value === null) throw new Error(`no option matching ${pattern}`);
  await select.selectOption(value);
}

row("ADM-01", "admin/01-dashboard.png", "admin", async (page, r) => {
  await shot.viewport(page, r);
});

row("ADM-02", "admin/02-status-banner.png", "admin", async (page, r) => {
  await page.getByRole("button", { name: "Check System Health Status" }).click();
  await page.getByRole("button", { name: "Check System Health Status" }).waitFor({ timeout: 15_000 });
  await settle(page);
  await shot.of(page, r, page.locator('section[aria-labelledby="system-status"]'));
});

row("ADM-03", "admin/03-users.png", "admin", async (page, r) => {
  await go(page, "/admin/users");
  await page.getByRole("radio", { name: /^All accounts/ }).click();
  await settle(page);
  await shot.viewport(page, r);
});

row("ADM-04", "admin/04-new-account.png", "admin", async (page, r) => {
  await go(page, "/admin/users");
  await page.getByRole("button", { name: "New account" }).first().click();
  const d = page.getByRole("dialog", { name: "New account" });
  await d.waitFor();
  await d.locator("#acct-name").fill("Lorna Dizon");
  await d.locator("#acct-email").fill("lorna.dizon@demo.icare.ph");
  await choose(d.locator("#acct-role"), /^Instructor$/);
  await choose(d.locator("#acct-sex"), /^Female \(Ms\.\)$/);
  await choose(d.locator("#acct-owner"), /^Ramon Castillo/);
  await page.waitForTimeout(300);
  // Don't save: the demo would show its demo-only temporary password.
  await shot.of(page, r, d);
});

row("ADM-05", "admin/05-account-request.png", "admin", async (page, r) => {
  await bellPopover(page, r);
});

row("ADM-06", "admin/06-account-from-request.png", "admin", async (page, r) => {
  await page.getByRole("button", { name: /^Notifications/ }).first().click();
  const pop = page.getByRole("dialog", { name: "Notifications" });
  await pop.getByRole("button", { name: "Accept" }).first().click();
  await page.waitForURL(/\/admin\/users/);
  const d = page.getByRole("dialog", { name: "New account" });
  await d.waitFor();
  await settle(page);
  await shot.of(page, r, d);
});

row("ADM-07", "admin/07-edit-account.png", "admin", async (page, r) => {
  await go(page, "/admin/users");
  await page.locator("tr", { hasText: "Jose Reyes" }).getByRole("button", { name: "Edit account" }).click();
  const d = page.getByRole("dialog", { name: "Edit account" });
  await d.waitFor();
  await settle(page);
  await shot.of(page, r, d);
});

async function composeAnnouncement(page) {
  await go(page, "/admin/announcements");
  await page.getByRole("radio", { name: "By Role" }).click();
  await page.locator("label", { hasText: /^Instructors/ }).locator("input").check();
  await page.getByPlaceholder("e.g. System maintenance on Saturday").fill("System maintenance on Saturday");
  await page
    .getByPlaceholder(/What should/)
    .fill(
      "iCARE++ will be offline this Saturday from 8:00 to 10:00 AM while we update the system.\nSave any grading you are doing before 8:00 AM.",
    );
  await page.waitForTimeout(400);
}

row("ADM-08", "admin/08-announcement.png", "admin", async (page, r) => {
  await composeAnnouncement(page);
  const card = await cardAround(page, page.locator("#title, input[placeholder^='e.g.']"), page.getByRole("button", { name: "Send Announcement" }));
  await shot.of(page, r, card);
});

row("ADM-09", "admin/09-announcement-confirm.png", "admin", async (page, r) => {
  await composeAnnouncement(page);
  await page.getByRole("button", { name: "Send Announcement" }).click();
  // ConfirmModal has no dialog role: take its card.
  const d = page.locator("div.fixed.inset-0 > div.bg-surface", { hasText: "Send this announcement?" });
  await d.waitFor();
  await page.waitForTimeout(500);
  // Never select Send Now.
  await shot.of(page, r, d);
});

row("ADM-10", "admin/10-support-requests.png", "admin", async (page, r) => {
  await go(page, "/admin/support");
  await page.getByRole("radio", { name: /^Needs Reply/ }).click().catch(() => page.getByText("Needs Reply").first().click());
  await page.locator('section[aria-label="Requests"] button, section[aria-label="Requests"] li').first().click();
  await settle(page);
  const box = page.getByPlaceholder(/^Hi /);
  await box.fill("Hi Maria, thank you for the screenshot. We have found the cause and will fix the Group B results today.");
  await box.scrollIntoViewIfNeeded();
  await page.locator("body").click({ position: { x: 1435, y: 895 } });
  await page.waitForTimeout(400);
  await shot.viewport(page, r);
});

row("ADM-11", "admin/11-activity-log.png", "admin", async (page, r) => {
  await go(page, "/admin/audit");
  await shot.viewport(page, r);
});

row("ADM-12", "admin/12-system-performance.png", "admin", async (page, r) => {
  await go(page, "/admin/performance");
  await page.getByRole("radio", { name: "24 hours" }).click();
  await settle(page);
  await shot.viewport(page, r);
});

row("ADM-13", "admin/13-system-tests.png", "admin", async (page, r) => {
  await go(page, "/admin/tests");
  const health = page.locator("section#health");
  await health.getByRole("button", { name: "Check System Health Status" }).click();
  await health.getByRole("button", { name: "Check System Health Status" }).waitFor({ timeout: 15_000 });
  await settle(page);
  await scroller(page).evaluate((el) => el.scrollTo(0, 0));
  await shot.of(page, r, [page.locator('nav[aria-label="Test suites"]'), health]);
});

row("ADM-14", "admin/14-student-web-app.png", "admin", async (page, r) => {
  await go(page, "/admin/student-web");
  await shot.viewport(page, r);
});

// --- dean (Dean demo) ----------------------------------------------------------

/** The Dean's Students page with a section's roster open. */
async function openRoster(page, section) {
  await go(page, "/dean/student-management");
  await page.getByRole("button", { name: `View ${section} roster` }).click();
  await settle(page);
}

row("DEAN-01", "dean/01-overview.png", "dean", async (page, r) => {
  await shot.viewport(page, r);
});

row("DEAN-02", "dean/02-students.png", "dean", async (page, r) => {
  await go(page, "/dean/student-management");
  await shot.viewport(page, r);
});

row("DEAN-03", "dean/03-section-roster.png", "dean", async (page, r) => {
  await openRoster(page, "BSN 3101");
  await shot.viewport(page, r);
});

row("DEAN-04", "dean/04-bulk-enroll.png", "dean", async (page, r) => {
  await openRoster(page, "BSN 3101");
  await page.getByRole("button", { name: /Bulk enroll/ }).click();
  const d = page.getByRole("dialog").filter({ hasText: "Add a student by hand" });
  await d.waitFor();
  const people = [
    ["Rina", "Soriano", "rina.soriano@student.demo.icare.ph", "female"],
    ["Paulo", "Medina", "paulo.medina@student.demo.icare.ph", "male"],
  ];
  for (const [i, [first, last, email, sex]] of people.entries()) {
    const n = i + 1;
    if ((await d.getByLabel(`Student ${n} first name`).count()) === 0) {
      await d.getByRole("button", { name: /Add a student by hand/ }).click();
    }
    await d.getByLabel(`Student ${n} first name`).fill(first);
    await d.getByLabel(`Student ${n} last name`).fill(last);
    await d.getByLabel(`Student ${n} email`).fill(email);
    await d.getByLabel(`Student ${n} sex`).selectOption(sex);
    await d.getByLabel(`Student ${n} group`).fill("Group A");
  }
  await page.waitForTimeout(400);
  // Never select Enroll.
  await shot.of(page, r, d);
});

row("DEAN-05", "dean/05-edit-groups.png", "dean", async (page, r) => {
  await openRoster(page, "BSN 3101");
  await page.getByRole("radio", { name: /Edit groups/ }).click();
  await settle(page);
  await shot.viewport(page, r);
});

row("DEAN-06", "dean/06-instructors.png", "dean", async (page, r) => {
  await go(page, "/dean/instructors");
  await shot.viewport(page, r);
});

row("DEAN-07", "dean/07-assign-groups.png", "dean", async (page, r) => {
  await go(page, "/dean/instructors");
  await page.getByRole("button", { name: "Actions for Maria Santos" }).click();
  await page.getByRole("menuitem", { name: "Assign Groups" }).click();
  const d = page.locator('[role="dialog"][aria-labelledby="assign-groups-title"]');
  await d.waitFor();
  await settle(page);
  await shot.of(page, r, d);
});

row("DEAN-08", "dean/08-program-chairs.png", "dean", async (page, r) => {
  await go(page, "/dean/program-chairs");
  await shot.viewport(page, r);
});

row("DEAN-09", "dean/09-curriculum.png", "dean", async (page, r) => {
  await go(page, "/dean/curriculum");
  await shot.viewport(page, r);
});

row("DEAN-10", "dean/10-courses.png", "dean", async (page, r) => {
  await go(page, "/dean/courses");
  await shot.viewport(page, r);
});

row("DEAN-11", "dean/11-add-course.png", "dean", async (page, r) => {
  await go(page, "/dean/courses/new");
  // Semester and year stay on the current term; then the course and instructor.
  // The plan's NCM 103 isn't in the demo curriculum's first-semester list.
  await choose(page.locator("select", { has: page.locator("option", { hasText: "Choose a course" }) }), /^NCM 105L/);
  await choose(page.locator("select", { has: page.locator("option", { hasText: "Choose an instructor" }) }), /^Liza Fernandez/);
  await page.waitForTimeout(400);
  await shot.clip(page, r, await mainArea(page));
});

row("DEAN-12", "dean/12-room-layout.png", "dean", async (page, r) => {
  await go(page, "/dean/wards");
  await page.getByRole("button", { name: "Room Layout" }).first().click();
  await settle(page);
  await shot.viewport(page, r);
});

row("DEAN-13", "dean/13-edit-layout.png", "dean", async (page, r) => {
  await go(page, "/dean/wards");
  await page.getByRole("button", { name: "Edit Layout" }).click();
  await settle(page);
  await page.getByRole("button", { name: /Add Room/ }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot.viewport(page, r);
});

row("DEAN-14", "dean/14-admit-patient.png", "dean", async (page, r) => {
  await go(page, "/dean/wards");
  // Tall enough for the whole form; the dialog's height follows the window.
  await page.setViewportSize({ width: DESKTOP.width, height: 1500 });
  await page.getByRole("button", { name: /Admit Patient/ }).click();
  const d = page.locator("div.bg-surface.max-w-2xl", { has: page.getByRole("heading", { name: "Add Patient" }) });
  await d.waitFor();
  await settle(page);
  await shot.of(page, r, d);
});

row("DEAN-15", "dean/15-analytics.png", "dean", async (page, r) => {
  await go(page, "/dean/analytics");
  await shot.viewport(page, r);
});

row("DEAN-16", "dean/16-reports.png", "dean", async (page, r) => {
  await go(page, "/dean/reports");
  await shot.viewport(page, r);
});

row("DEAN-17", "dean/17-grade-change.png", "dean", async (page, r) => {
  await bellPopover(page, r);
});

// --- program-chair (Program Chair demo) ----------------------------------------

row("PC-01", "program-chair/01-sidebar.png", "pc", async (page, r) => {
  await shot.of(page, r, page.locator("aside").first(), 0);
});

row("PC-02", "program-chair/02-overview-header.png", "pc", async (page, r) => {
  await shot.of(page, r, scroller(page).locator("header").first());
});

// @@ROWS@@

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const wanted = ROWS.filter((r) => ONLY.length === 0 || ONLY.some((o) => r.id === o || r.id.startsWith(`${o}-`) || r.id.startsWith(o)));
// The full Chromium build, not the headless shell: only it has the PDF viewer
// the report preview draws into.
browser = await chromium.launch({ headless: !HEADED, channel: "chromium" });
const failed = [];
for (const r of wanted) {
  console.log(`${r.id} ${r.file}`);
  const { context, page } = await openPage(r);
  try {
    if (r.role) await startDemo(page, r.role);
    await r.run(page, r);
  } catch (err) {
    failed.push(r.id);
    console.log(`  FAILED: ${err.message.split("\n")[0]}`);
    const where = path.join(process.env.MANUAL_DEBUG_DIR || os.tmpdir(), `manual-failed-${r.id}.png`);
    await page.screenshot({ path: where }).catch(() => {});
    console.log(`  page at failure: ${where}`);
  } finally {
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }
}
await browser.close();

if (leaks.length) {
  console.log(`\n/api requests that reached the network (blocked):\n  ${leaks.join("\n  ")}`);
}
console.log(`\n${wanted.length - failed.length} of ${wanted.length} rows captured.`);
if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
process.exit(failed.length || leaks.length ? 1 : 0);
