import { mkdir, writeFile } from "node:fs/promises";
import { checkAvailability } from "./checkAvailability.js";
import { PARK_NAME, REPORTS_DIR } from "./config.js";
import { notify } from "./notify.js";
import { upcomingWeekends } from "./weekends.js";

async function main() {
  console.log(`בודק זמינות לחושות ב${PARK_NAME} בסופי השבוע הקרובים...`);

  const weekends = upcomingWeekends();
  const results = await checkAvailability(weekends);

  await notify(results);

  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(
    `${REPORTS_DIR}latest.json`,
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
    "utf-8",
  );
}

main().catch((error) => {
  console.error("בדיקת הזמינות נכשלה:", error);
  process.exitCode = 1;
});
