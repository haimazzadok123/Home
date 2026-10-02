import { WEEKEND_NIGHTS, WEEKS_AHEAD } from "./config.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function nextFriday(from) {
  const date = new Date(from);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay(); // 0=ראשון ... 5=שישי
  const daysUntilFriday = (5 - day + 7) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilFriday);
  return date;
}

/**
 * מחשב את סופי השבוע הקרובים (כניסה ביום שישי, יציאה כעבור WEEKEND_NIGHTS לילות).
 * @param {Date} from - נקודת ההתחלה לחישוב (בעיקר לצורך בדיקות).
 * @returns {{ checkIn: string, checkOut: string, label: string }[]}
 */
export function upcomingWeekends(from = new Date()) {
  const firstFriday = nextFriday(from);
  const weekends = [];

  for (let i = 0; i < WEEKS_AHEAD; i++) {
    const checkIn = new Date(firstFriday.getTime() + i * 7 * MS_PER_DAY);
    const checkOut = new Date(checkIn.getTime() + WEEKEND_NIGHTS * MS_PER_DAY);
    weekends.push({
      checkIn: toISODate(checkIn),
      checkOut: toISODate(checkOut),
      label: `${toISODate(checkIn)} → ${toISODate(checkOut)}`,
    });
  }

  return weekends;
}
