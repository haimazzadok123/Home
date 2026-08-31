import nodemailer from "nodemailer";
import { EMAIL_CONFIG, isEmailConfigured, PARK_NAME } from "./config.js";

/**
 * ממשק התראה. תמיד מדפיס ללוג ההרצה, ואם הוגדר SMTP (ראו config.js) — שולח גם
 * מייל, אך ורק כשנמצאה זמינות אפשרית (כדי לא להציף בתיבה בכל הרצה יומית ריקה).
 * @param {{ label: string, status: "available" | "sold_out" | "unknown", detail?: string }[]} results
 */
export async function notify(results) {
  const available = results.filter((r) => r.status === "available");

  console.log("\n=== תוצאות בדיקת זמינות — גן לאומי אכזיב ===");
  for (const r of results) {
    const icon =
      r.status === "available" ? "✅" : r.status === "sold_out" ? "❌" : "❔";
    console.log(`${icon} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
  }

  if (available.length > 0) {
    console.log(
      `\n🎉 נמצאה זמינות אפשרית ב-${available.length} סוף/י שבוע: ` +
        available.map((r) => r.label).join(", "),
    );
    try {
      await sendEmail(available, { isTest: false });
    } catch (error) {
      console.warn("שליחת מייל ההתראה נכשלה:", error.message);
    }
  } else {
    console.log("\nלא נמצאה זמינות ודאית בסופי השבוע שנבדקו.");
  }
}

/**
 * שולח מייל בדיקה מיידי עם תאריך לדוגמה, כדי לוודא שהגדרות ה-SMTP תקינות מבלי
 * להמתין לזמינות אמיתית (ובלי להריץ בכלל את הבדיקה מול האתר/Playwright).
 */
export async function sendTestEmail() {
  console.log("שולח מייל בדיקה...");
  if (!isEmailConfigured) {
    throw new Error(
      "לא ניתן לשלוח מייל בדיקה — חסרים SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL_TO (ראו README).",
    );
  }
  await sendEmail(
    [{ label: "2026-01-01 → 2026-01-03 (דוגמה)", status: "available" }],
    { isTest: true },
  );
}

async function sendEmail(available, { isTest }) {
  if (!isEmailConfigured) {
    console.log(
      "(שליחת מייל מדולגת — SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL_TO לא מוגדרים, ראו README)",
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.host,
    port: EMAIL_CONFIG.port,
    secure: EMAIL_CONFIG.port === 465,
    auth: { user: EMAIL_CONFIG.user, pass: EMAIL_CONFIG.pass },
  });

  const list = available.map((r) => `<li>${r.label}</li>`).join("");
  const subject = isTest
    ? `מייל בדיקה — סוכן הזמינות של ${PARK_NAME} ✅`
    : `נמצאה זמינות אפשרית ב${PARK_NAME} 🎉`;
  const intro = isTest
    ? `זהו מייל בדיקה מהסוכן שבודק זמינות ב${PARK_NAME}. אם קיבלת אותו, הגדרות ה-SMTP תקינות. הדוגמה למטה אינה זמינות אמיתית:`
    : `נמצאה זמינות אפשרית לחושה ב${PARK_NAME} בסופי השבוע הבאים:`;

  await transporter.sendMail({
    from: EMAIL_CONFIG.from,
    to: EMAIL_CONFIG.to,
    subject,
    html: `<p>${intro}</p><ul>${list}</ul>`,
  });
  console.log(`נשלח מייל ${isTest ? "בדיקה " : ""}אל ${EMAIL_CONFIG.to}`);
}
