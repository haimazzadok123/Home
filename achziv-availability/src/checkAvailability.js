import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { DEBUG_DIR, RESERVATION_URL } from "./config.js";
import { isCalibrated, selectors } from "./selectors.js";

function classify(pageText) {
  const soldOut = selectors.soldOutTextHints.some((hint) =>
    pageText.includes(hint),
  );
  const available = selectors.availableTextHints.some((hint) =>
    pageText.includes(hint),
  );

  if (soldOut && !available) return "sold_out";
  if (available && !soldOut) return "available";
  return "unknown";
}

async function saveDebugArtifacts(page, name) {
  await mkdir(DEBUG_DIR, { recursive: true });
  await page.screenshot({
    path: `${DEBUG_DIR}${name}.png`,
    fullPage: true,
  });
  const html = await page.content();
  await writeFile(`${DEBUG_DIR}${name}.html`, html, "utf-8");
}

/**
 * בודק זמינות עבור רשימת סופי שבוע.
 *
 * חשוב: ה-selectors טרם כוילו מול האתר האמיתי (ראו src/selectors.js),
 * כי לא ניתן היה לגלוש אליו מסביבת הפיתוח. כל עוד לא כוילו, הפונקציה
 * פועלת ב"מצב כללי": היא טוענת את דף ההזמנה פעם אחת, שומרת צילום מסך
 * ו-HTML לכיול ב-debug/, ומחזירה לכל סוף שבוע את אותה תוצאה כללית
 * (unknown/available/sold_out) לפי תוכן הדף — ולא זמינות פר-תאריך אמיתית.
 *
 * @param {{ checkIn: string, checkOut: string, label: string }[]} weekends
 */
export async function checkAvailability(weekends) {
  const browser = await chromium.launch();
  const results = [];

  try {
    const page = await browser.newPage();
    await page.goto(RESERVATION_URL, { waitUntil: "networkidle" });
    await saveDebugArtifacts(page, "reservation-page");

    if (!isCalibrated) {
      const pageText = await page.innerText("body");
      const status = classify(pageText);
      const detail =
        "מצב כללי בלבד — הסלקטורים לבדיקה פר-תאריך טרם כוילו (ראו debug/ ו-src/selectors.js)";
      for (const weekend of weekends) {
        results.push({ ...weekend, status, detail });
      }
      return results;
    }

    for (const weekend of weekends) {
      await page.fill(selectors.checkInSelector, weekend.checkIn);
      await page.fill(selectors.checkOutSelector, weekend.checkOut);
      await page.click(selectors.searchButtonSelector);
      await page.waitForLoadState("networkidle");

      const pageText = await page.innerText("body");
      results.push({ ...weekend, status: classify(pageText) });
    }

    return results;
  } finally {
    await browser.close();
  }
}
