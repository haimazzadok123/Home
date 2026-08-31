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
    await sendAvailabilityEmail(available);
  } else {
    console.log("\nלא נמצאה זמינות ודאית בסופי השבוע שנבדקו.");
  }
}

async function sendAvailabilityEmail(available) {
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

  try {
    await transporter.sendMail({
      from: EMAIL_CONFIG.from,
      to: EMAIL_CONFIG.to,
      subject: `נמצאה זמינות אפשרית ב${PARK_NAME} 🎉`,
      html: `<p>נמצאה זמינות אפשרית לחושה ב${PARK_NAME} בסופי השבוע הבאים:</p><ul>${list}</ul>`,
    });
    console.log(`נשלח מייל התראה אל ${EMAIL_CONFIG.to}`);
  } catch (error) {
    console.warn("שליחת מייל ההתראה נכשלה:", error.message);
  }
}
