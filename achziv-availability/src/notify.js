/**
 * ממשק התראה. כרגע רק מדפיס ללוג ההרצה (כפי שנבחר) — נכתב כך שאפשר להוסיף
 * בעתיד מימוש נוסף (Telegram, מייל וכו') מבלי לגעת בלוגיקת הבדיקה עצמה.
 * @param {{ label: string, status: "available" | "sold_out" | "unknown", detail?: string }[]} results
 */
export function notify(results) {
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
  } else {
    console.log("\nלא נמצאה זמינות ודאית בסופי השבוע שנבדקו.");
  }
}
