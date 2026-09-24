/**
 * Browser end-to-end check of the Sept 23 demo script.
 *
 *   request -> options -> select -> confirm -> booked -> visible on Calendar
 *   -> "make it 45 and add Nina" -> new options
 *   -> "what emails need my attention?" -> email cards with the three actions
 *
 * Needs a running local demo server:
 *   AUTH_MODE=demo npm run dev
 *   npm run e2e            (or: node scripts/e2e-demo.mjs http://localhost:3000)
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`  PASS  ${label}`); }
  else { fail += 1; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`); }
};

async function ask(page, text) {
  const before = await page.locator(".turn-assistant").count();
  await page.fill("#chat-input", text);
  await page.keyboard.press("Enter");
  await page.waitForFunction((count) => document.querySelectorAll(".turn-assistant").length > count && !document.querySelector(".assistant-thinking"), before, { timeout: 20_000 });
}

try {
  for (const [width, height, label] of [[1440, 900, "laptop"], [390, 844, "phone"]]) {
    console.log(`== ${label} (${width}px)`);
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => { try { localStorage.setItem("ecc:executive-onboarding:v1:p_ceo", "dismissed"); } catch { /* ignore */ } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    check("lands on the centered chat", await page.locator(".chat-greeting").isVisible());
    check("four suggestion cards", (await page.locator(".suggestion-card").count()) === 4);

    await page.locator(".suggestion-card", { hasText: "Find time with Ray and Priya" }).click();
    await page.waitForSelector(".slot-card", { timeout: 20_000 });
    const options = await page.locator(".slot-card").count();
    check("3 to 4 time options", options >= 3 && options <= 4, `saw ${options}`);

    await page.locator(".slot-card").first().click();
    check("a confirmation card opens", await page.locator(".confirm-card").isVisible());
    await page.fill(".confirm-field input", "Q4 planning sync");
    await page.locator(".confirm-actions .btn-primary").click();
    await page.waitForSelector(".event-confirmation", { timeout: 20_000 });
    check("the booking is confirmed in the thread", (await page.locator(".event-confirmation").innerText()).includes("Q4 planning sync"));

    await ask(page, "Actually make it 45 and add Nina");
    const revised = page.locator(".turn-assistant").last();
    check("the follow-up offers new options", (await revised.locator(".slot-card").count()) > 0);
    check("the revision is explained", (await revised.innerText()).includes("45 minutes, adding Nina"));

    await ask(page, "What emails need my attention?");
    const cards = page.locator(".turn-assistant").last().locator(".email-card");
    check("email cards come back", (await cards.count()) >= 3);
    check("each card offers Reply, Quick reply, Later", (await cards.first().locator(".triage-button").count()) === 3);

    await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle" });
    check("the booked meeting is on the Calendar page", (await page.locator(".agenda-list").innerText()).includes("Q4 planning sync"));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal scroll", overflow <= 0, `overflow ${overflow}px`);
    check("no page errors", errors.length === 0, errors.join(" | "));
    await context.close();
  }
  console.log("== voice (stubbed browser speech service)");
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      try { localStorage.setItem("ecc:executive-onboarding:v1:p_ceo", "dismissed"); localStorage.setItem("assistant:auto-send-voice", "1"); } catch { /* ignore */ }
      // Stands in for the browser's recognition service: interim words, then
      // the final phrase, then end-of-speech, the way Chrome reports them.
      window.SpeechRecognition = window.webkitSpeechRecognition = class {
        start() {
          const said = "find thirty minutes next week with ray and priya";
          const result = (text, isFinal) => ({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
          setTimeout(() => this.onresult?.(result("find thirty minutes", false)), 50);
          setTimeout(() => this.onresult?.(result(said, true)), 120);
          setTimeout(() => this.onend?.(), 180);
        }
        stop() { this.onend?.(); }
        abort() {}
      };
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    check("the mic is labeled for screen readers", (await page.getAttribute(".composer-mic", "aria-label")) === "Speak your request");
    await page.click(".composer-mic");
    await page.waitForSelector(".slot-card", { timeout: 20_000 });
    check("speaking the request produces the options flow", (await page.locator(".slot-card").count()) >= 3);
    check("the spoken words were sent as the request", (await page.locator(".turn-user .bubble").first().innerText()).includes("thirty minutes"));
    await context.close();

    const unsupported = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await unsupported.addInitScript(() => {
      try { localStorage.setItem("ecc:executive-onboarding:v1:p_ceo", "dismissed"); } catch { /* ignore */ }
      delete window.webkitSpeechRecognition;
      delete window.SpeechRecognition;
    });
    const firefoxLike = await unsupported.newPage();
    await firefoxLike.goto(`${BASE}/`, { waitUntil: "networkidle" });
    check("unsupported browsers say so on the mic", (await firefoxLike.getAttribute(".composer-mic", "aria-disabled")) === "true");
    // aria-disabled keeps the button focusable so the explanation can be reached; Playwright needs force to press it.
    await firefoxLike.click(".composer-mic", { force: true });
    check("and explain what to use instead", (await firefoxLike.locator(".composer-error").innerText()).includes("not available in this browser"));
    await unsupported.close();
  }
} finally {
  await browser.close();
}

console.log(`\npassed: ${pass}   failed: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
