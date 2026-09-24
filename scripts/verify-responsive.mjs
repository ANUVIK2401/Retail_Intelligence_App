/**
 * Cross-device layout check.
 *
 * The app is used on a phone in a hallway and on a laptop in a meeting, so
 * both have to work. This sweeps every page at every device width and fails on
 * the three things that actually break a demo:
 *
 *   1. horizontal scroll (the page slides sideways under your thumb)
 *   2. touch targets under 44px (constitution requirement)
 *
 * Run:  node scripts/verify-responsive.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

const SIZES = [
  [320, 568, "iPhone SE"],
  [375, 667, "iPhone 8"],
  [390, 844, "iPhone 14"],
  [430, 932, "iPhone 15 Pro Max"],
  [768, 1024, "iPad portrait"],
  [1024, 768, "iPad landscape"],
  [1280, 800, "small laptop"],
  [1440, 900, "laptop"],
  [1920, 1080, "desktop"],
];

const PAGES = ["/", "/inbox", "/schedule", "/projects", "/projects/pr_denim", "/insights", "/workspace", "/publish", "/org-chart", "/controls", "/audit", "/admin"];

const browser = await chromium.launch();
const ctx = await browser.newContext();
// The first-run tour is a modal; measure the pages behind it.
await ctx.addInitScript(() => { try { localStorage.setItem("ecc:executive-onboarding:v1:p_ceo", "dismissed"); } catch { /* ignore */ } });
const page = await ctx.newPage();

let pass = 0;
let fail = 0;
const failures = [];

for (const [w, h, label] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(220);

    const result = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth > vw + 1;

      // Measure the tappable area, not the painted control. A 20px checkbox
      // inside a 44px label is fine: the finger lands on the label, which is
      // what the browser forwards to the input.
      const tappableHeight = (el) => {
        let node = el;
        let best = el.getBoundingClientRect().height;
        for (let i = 0; i < 3 && node.parentElement; i += 1) {
          node = node.parentElement;
          const tag = node.tagName;
          const clickable = tag === "LABEL" || tag === "A" || tag === "BUTTON";
          if (!clickable) continue;
          best = Math.max(best, node.getBoundingClientRect().height);
        }
        return Math.round(best);
      };

      const small = [...document.querySelectorAll("button,a,input,textarea,select")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({
          t: (el.innerText || el.tagName).trim().slice(0, 24),
          h: tappableHeight(el),
        }))
        .filter((x) => x.h > 0 && x.h < 44);

      return { overflow, scrollW: document.documentElement.scrollWidth, vw, small: small.slice(0, 3) };
    });

    const problems = [];
    if (result.overflow) problems.push(`overflows (${result.scrollW}px in ${result.vw}px)`);
    if (result.small.length) {
      problems.push(`${result.small.length} target(s) under 44px: ${result.small.map((s) => `"${s.t}"@${s.h}px`).join(", ")}`);
    }

    if (problems.length === 0) {
      pass += 1;
    } else {
      fail += 1;
      failures.push(`  ${label} (${w}px) ${path}: ${problems.join("; ")}`);
    }
  }
}

await browser.close();

if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log(f);
  console.log("");
}
console.log(`passed: ${pass}   failed: ${fail}   (${SIZES.length} sizes x ${PAGES.length} pages)`);
process.exit(fail === 0 ? 0 : 1);
