// כתובת עמוד ההזמנה הרשמי של רשות הטבע והגנים לגן הלאומי אכזיב וחוף אכזיב.
// אומת קיומו רק דרך תוצאות חיפוש — לא ניתן היה לגלוש אליו בפועל מסביבת הפיתוח
// (חסימת רשת ברמת המדיניות הארגונית), ולכן טרם כויל מול ה-DOM האמיתי של הדף.
export const RESERVATION_URL =
  "https://www.parks.org.il/reserve-park/%D7%92%D7%9F-%D7%9C%D7%90%D7%95%D7%9E%D7%99-%D7%90%D7%9B%D7%96%D7%99%D7%91-%D7%95%D7%97%D7%95%D7%A3-%D7%90%D7%9B%D7%96%D7%99%D7%91/";

// עמוד המידע הכללי על חניון הלילה (חושות), לשימוש כגיבוי/הפניה בדוחות.
export const INFO_URL =
  "https://www.parks.org.il/camping/%D7%97%D7%A0%D7%99%D7%95%D7%9F-%D7%9C%D7%99%D7%9C%D7%94-%D7%92%D7%9F-%D7%9C%D7%90%D7%95%D7%9E%D7%99-%D7%90%D7%9B%D7%96%D7%99%D7%91-%D7%95%D7%97%D7%95%D7%A3-%D7%90%D7%9B%D7%96%D7%99%D7%91/";

export const PARK_NAME = "גן לאומי אכזיב";

// כמה סופי שבוע קדימה לבדוק.
export const WEEKS_AHEAD = Number(process.env.ACHZIV_WEEKS_AHEAD ?? 8);

// אורך מינימלי של הזמנה בסוף שבוע (לילות) — לפי מדיניות רט"ג לחניוני לילה
// בסופי שבוע וחגים (שני לילות: שישי ושבת).
export const WEEKEND_NIGHTS = 2;

export const TIMEZONE = "Asia/Jerusalem";

export const DEBUG_DIR = new URL("../debug/", import.meta.url).pathname;
export const REPORTS_DIR = new URL("../reports/", import.meta.url).pathname;
