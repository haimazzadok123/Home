# שרת התראות המבזקים (Cloudflare Worker)

שרת קטן שבודק כל דקה את המבזקים של ynet, מעריב ורוטר, ושולח התראת פוש על כל מבזק חדש למכשירים שהפעילו
"התראות לטלפון" בהגדרות הלוח. הוא יוצר לבד את מפתחות ההצפנה בפעם הראשונה ושומר אותם באחסון שלך ב-Cloudflare,
כך שאין סודות להגדיר. בחשבון החינמי זה בחינם.

## פריסה דרך האתר של Cloudflare

1. **Workers & Pages → Create → Create Worker.** שם: `home-flash-push`. לוחצים Deploy.
2. **Edit code:** מוחקים את כל הקוד, מדביקים את כל התוכן של `push-worker/worker.js` (ב-GitHub: פותחים את הקובץ ← Raw ← מעתיקים הכול), ולוחצים Deploy.
3. **Storage & Databases → KV → Create namespace.** שם: `home-flash-push`.
4. **בחזרה ל-Worker → Settings → Bindings → Add → KV namespace.** שם המשתנה: `SUBS` (בדיוק כך), ובוחרים את ה-namespace מסעיף 3. שומרים.
5. **Settings → Trigger events (או Triggers) → Add → Cron trigger:** כל דקה, `* * * * *`. שומרים.
6. מעתיקים את כתובת ה-Worker (נראית כמו `https://home-flash-push.<שם>.workers.dev`). פתיחה שלה בדפדפן צריכה להראות `{"ok":true,...}`.

את הכתובת מכניסים לקבוע `PUSH_SERVER` ב-`public/dashboard/app.js`.

## פריסה עם wrangler (למי שיש Node.js)

```bash
cd push-worker
npx wrangler kv namespace create SUBS   # מעתיקים את ה-id שמתקבל ל-wrangler.toml
npx wrangler deploy
```

## איך זה עובד

- `GET /config` מחזיר את המפתח הציבורי שהדפדפן צריך כדי להירשם.
- `POST /subscribe`, `/unsubscribe`, `/test` נקראים מכפתור "התראות לטלפון" בהגדרות הלוח.
- כל דקה (`scheduled`) נקראים הפידים. הקריאה הראשונה של כל פיד רק מתעדת את מה שיש; אחר כך כל מבזק חדש,
  בן פחות מ-30 דקות, נשלח לכל מכשיר רשום, לפי האתרים שבחר בלוח ובלי לשלוח בשעות מצב הלילה שלו. 4 מבזקים
  או יותר באותה דקה נשלחים כהתראה מסכמת אחת.
- ב-KV נשמרים: זוג המפתחות, רשימת המבזקים שכבר נראו (נכתבת רק כשיש שינוי, כדי לא לעבור את מכסת הכתיבה
  החינמית), והמכשירים הרשומים. מכשיר שביטל הרשמה (תשובה 404/410) נמחק אוטומטית.
- ההצפנה היא Web Push סטנדרטי (RFC 8291 ו-VAPID), בלי ספריות חיצוניות.
