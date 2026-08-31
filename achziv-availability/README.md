# סוכן בדיקת זמינות — גן לאומי אכזיב

סקריפט Node שבודק אוטומטית זמינות לחושות (לינת לילה) בגן הלאומי אכזיב עבור
סופי השבוע הקרובים (ברירת מחדל: 8 שבועות קדימה, כניסה בשישי ליומיים), ומדפיס
את התוצאות ללוג ההרצה. אם מוגדר SMTP (ראו "התראות במייל" למטה), נשלח גם מייל
— אך ורק כשנמצאה זמינות אפשרית, כדי לא להציף בתיבה בכל הרצה יומית ריקה.

## הרצה אוטומטית

הסוכן רץ פעם ביום דרך GitHub Actions (`.github/workflows/achziv-availability.yml`),
וניתן גם להריץ אותו ידנית מלשונית Actions ("Run workflow"). התוצאות מופיעות
בלוג ההרצה ובסיכום ה-run, וצילום מסך + HTML של הדף שנבדק נשמרים כ-artifact
של ההרצה (`debug/`).

## הרצה מקומית

```bash
cd achziv-availability
npm install
npx playwright install --with-deps chromium
npm start
```

ניתן לשלוט על טווח הבדיקה עם משתנה סביבה:

```bash
ACHZIV_WEEKS_AHEAD=4 npm start
```

## התראות במייל

שליחת מייל מתבצעת רק אם מוגדרים ב-repo (Settings → Secrets and variables →
Actions → New repository secret) הסודות הבאים; אם חסר אחד מהם, שליחת המייל
פשוט מדולגת (הלוג ימשיך לעבוד כרגיל):

| Secret | תיאור |
| --- | --- |
| `SMTP_HOST` | שרת ה-SMTP השולח, למשל `smtp.gmail.com` |
| `SMTP_PORT` | פורט (ברירת מחדל 465, SSL) |
| `SMTP_USER` | שם המשתמש/מייל השולח |
| `SMTP_PASS` | סיסמה / App Password |
| `ALERT_EMAIL_TO` | כתובת המייל שאליה יישלחו ההתראות |
| `ALERT_EMAIL_FROM` | כתובת "מאת" (אופציונלי — ברירת מחדל: `SMTP_USER`) |

**עם Gmail:** אי אפשר להשתמש בסיסמת Gmail הרגילה — יש ליצור "App Password"
ב-[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
(דורש אימות דו-שלבי מופעל בחשבון), ולהשתמש בו כ-`SMTP_PASS` עם
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<כתובת ה-Gmail>`.

להרצה מקומית עם מייל, אפשר להעביר את אותם משתני סביבה ידנית:

```bash
SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=you@gmail.com SMTP_PASS=xxxx \
  ALERT_EMAIL_TO=you@gmail.com npm start
```

### בדיקה שהמייל באמת מגיע

אחרי שהוגדרו ה-secrets, אפשר לוודא שהם תקינים בלי לחכות לזמינות אמיתית
(ובלי צורך ב-Playwright בכלל):

- **ב-GitHub Actions:** לשונית Actions → workflow "בדיקת שליחת מייל - סוכן
  אכזיב" → "Run workflow". תוך דקה אמור להגיע מייל בדיקה לכתובת
  שהוגדרה ב-`ALERT_EMAIL_TO`.
- **לוקאלית:** `SMTP_HOST=... SMTP_USER=... SMTP_PASS=... ALERT_EMAIL_TO=... npm run test-email`
  מתוך `achziv-availability/`.

אם ה-secrets לא הוגדרו, הפקודה נכשלת עם שגיאה ברורה במקום לשלוח בשקט "כאילו".

## מגבלה ידועה — כיול נדרש

דף ההזמנות הרשמי (parks.org.il) לא היה נגיש לגלישה מסביבת הפיתוח שבה נכתב
הסוכן (חסימת רשת ברמת מדיניות הארגון), ולכן לא ניתן היה לבדוק בפועל את מבנה
ה-DOM שלו. כתוצאה מכך, `src/selectors.js` ריק כברירת מחדל, והסוכן פועל
כרגע ב**מצב כללי**: הוא טוען את דף ההזמנות, שומר צילום מסך ו-HTML לתיקיית
`debug/`, ומדווח סטטוס כללי אחד (לפי מילות מפתח בעמוד) — לא זמינות מדויקת
פר-סוף-שבוע.

כדי להשלים כיול מדויק:

1. הריצו את הסוכן פעם אחת (לוקאלית או ב-Actions) ופתחו את `debug/reservation-page.png`/`.html`.
2. בדף ההזמנות בדפדפן, השתמשו בכלי הפיתוח (F12) כדי לאתר את שדות תאריך
   הכניסה/היציאה, כפתור החיפוש, ומחרוזות הטקסט שמופיעות במצב "פנוי"
   לעומת "מלא".
3. מלאו את הסלקטורים ב-`src/selectors.js`. ברגע שממולאים `checkInSelector`
   ו-`checkOutSelector`, הסוכן עובר אוטומטית לבדיקה פר-סוף-שבוע אמיתית.

קישור ישיר לעמוד ההזמנה (למציאה/כיול): ראו `RESERVATION_URL` ב-`src/config.js`.
