import { sendTestEmail } from "./notify.js";

sendTestEmail().catch((error) => {
  console.error("שליחת מייל הבדיקה נכשלה:", error.message);
  process.exitCode = 1;
});
