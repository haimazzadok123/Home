import { useEffect, useRef, type ReactNode } from 'react'
import { LEGAL_PAGES, type LegalPageId } from '../utils/legalPages'

/**
 * Contact details shown on the legal pages. The owner chose not to publish an email yet;
 * put an address here (e.g. 'name@example.com') and every page picks it up.
 */
const CONTACT_EMAIL = ''
const UPDATED = '9 בנובמבר 2026'

function Contact() {
  return CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <span>פרטי יצירת קשר יפורסמו כאן בקרוב.</span>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

const SERVICES: Array<{ name: string; use: string; sent: string; policy: string }> = [
  {
    name: 'GitHub Pages (GitHub, Inc.)',
    use: 'אחסון האתר',
    sent: 'כתובת IP ופרטי הדפדפן, כמו בכל כניסה לאתר אינטרנט',
    policy: 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement',
  },
  {
    name: 'OpenStreetMap (קרן OpenStreetMap)',
    use: 'אריחי המפה וחיפוש כתובות ומקומות (Nominatim)',
    sent: 'הטקסט שמקלידים בחיפוש, אזור המפה ואזורי החיפוש לאורך המסלול',
    policy: 'https://osmfoundation.org/wiki/Privacy_Policy',
  },
  {
    name: 'FOSSGIS e.V. ו-Project OSRM',
    use: 'חישוב מסלול הנסיעה (Valhalla, OSRM)',
    sent: 'נקודות היציאה והיעד (קואורדינטות)',
    policy: 'https://www.fossgis.de/datenschutzerklaerung/',
  },
  {
    name: 'שרתי Overpass ציבוריים (overpass-api.de, private.coffee, kumi.systems)',
    use: 'איתור מקומות לאורך המסלול',
    sent: 'אזורי החיפוש לאורך המסלול וסוגי המקומות שנבחרו',
    policy: 'https://wiki.openstreetmap.org/wiki/Overpass_API',
  },
  {
    name: 'Israel Hiking Map',
    use: 'אתרי טיול ותצפיות נוספים',
    sent: 'נקודות לאורך המסלול',
    policy: 'https://israelhiking.osm.org.il/',
  },
  {
    name: 'Open-Meteo',
    use: 'תחזית מזג אוויר',
    sent: 'מיקום נקודת היציאה או היעד ותאריך הנסיעה, רק אם בחרתם תאריך',
    policy: 'https://open-meteo.com/en/terms',
  },
]

function PrivacyPolicy() {
  return (
    <>
      <p>
        המדיניות מסבירה איזה מידע עובר כשמשתמשים באתר "מטיילים עם דוד חיים", לאן הוא עובר ומה הזכויות שלכם, בהתאם
        לחוק הגנת הפרטיות, התשמ"א-1981, ולתקנותיו.
      </p>

      <h3>בקצרה</h3>
      <ul>
        <li>אין באתר הרשמה, חשבון משתמש או טפסים, ולא מבקשים מכם שם, טלפון או מייל.</li>
        <li>לאתר אין שרת משלו ואין לו מאגר מידע. בעל האתר לא אוסף, לא שומר ולא רואה את החיפושים שלכם.</li>
        <li>אין באתר עוגיות (Cookies), כלי סטטיסטיקה, פרסומות או מעקב.</li>
        <li>כדי לחשב מסלול ולמצוא מקומות, הדפדפן שלכם פונה ישירות לשירותי מפות חיצוניים (פירוט בהמשך).</li>
      </ul>

      <h3>מידע שנשמר במכשיר שלכם בלבד</h3>
      <p>
        "מסלולים שמורים" נשמרים באחסון המקומי של הדפדפן (localStorage) במכשיר שלכם, יחד עם הגדרה טכנית של השרת
        שענה מהר בפעם האחרונה. המידע לא נשלח לשום מקום ולא מסתנכרן בין מכשירים. אפשר למחוק מסלול מתפריט
        "מועדפים", או למחוק הכול דרך ניקוי נתוני האתר בהגדרות הדפדפן.
      </p>

      <h3>קישורי שיתוף</h3>
      <p>
        כפתור "שיתוף" יוצר קישור שכולל את נקודות היציאה והיעד ואת הסינונים שבחרתם. מי שמקבל את הקישור יראה את
        המסלול. שתפו רק עם מי שאתם רוצים.
      </p>

      <h3>שירותים חיצוניים</h3>
      <p>
        כשאתם משתמשים באתר, הדפדפן שלכם שולח בקשות לשירותים הבאים. כמו בכל פנייה באינטרנט, השירות רואה גם את
        כתובת ה-IP שלכם ואת סוג הדפדפן. כל שירות פועל לפי מדיניות הפרטיות שלו, שנמצאת בקישור:
      </p>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th scope="col">שירות</th>
              <th scope="col">למה</th>
              <th scope="col">מה נשלח</th>
            </tr>
          </thead>
          <tbody>
            {SERVICES.map((s) => (
              <tr key={s.name}>
                <td>
                  <ExternalLink href={s.policy}>{s.name}</ExternalLink>
                </td>
                <td>{s.use}</td>
                <td>{s.sent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        חלק מהשירותים נמצאים מחוץ לישראל, ולכן המידע שנשלח אליהם עובר לחו"ל. הגופנים של האתר נשמרים באתר עצמו, כך
        שלא נשלח מידע לשירות גופנים חיצוני.
      </p>

      <h3>אבטחת מידע</h3>
      <ul>
        <li>האתר נטען רק בחיבור מוצפן (HTTPS), וגם כל הפניות לשירותים החיצוניים מוצפנות.</li>
        <li>
          מדיניות אבטחת תוכן (Content Security Policy) מגבילה את הדפדפן כך שהאתר יוכל לפנות רק לשירותים שברשימה למעלה
          ולהריץ רק את הקוד של האתר עצמו.
        </li>
        <li>מאחר שאין לאתר מאגר מידע או שרת, אין מידע אישי שנשמר אצל בעל האתר ושעלול לדלוף ממנו.</li>
      </ul>

      <h3>קטינים</h3>
      <p>האתר מתאים לכל גיל ואינו אוסף מידע אישי, גם לא מקטינים.</p>

      <h3>הזכויות שלכם</h3>
      <p>
        לפי חוק הגנת הפרטיות יש לכם זכות לעיין במידע שמוחזק עליכם ולבקש לתקן או למחוק אותו. בעל האתר אינו מחזיק מידע
        עליכם. המידע היחיד נמצא במכשיר שלכם, ואתם יכולים למחוק אותו בעצמכם כמתואר למעלה. לגבי מידע שהגיע לשירות חיצוני,
        פנו לאותו שירות לפי מדיניות הפרטיות שלו.
      </p>

      <h3>שינויים במדיניות</h3>
      <p>אם האתר ישתנה ויתחיל לאסוף מידע, המדיניות תעודכן כאן לפני כן, עם תאריך העדכון.</p>

      <h3>יצירת קשר</h3>
      <p>
        שאלות על פרטיות: <Contact />
      </p>
    </>
  )
}

function TermsOfUse() {
  return (
    <>
      <p>השימוש באתר "מטיילים עם דוד חיים" מותנה בתנאים האלה. השימוש באתר מהווה הסכמה להם.</p>

      <h3>מה האתר עושה</h3>
      <p>
        האתר עוזר לתכנן טיול: הוא מציג מסלול נסיעה ומקומות לאורכו, כמו תצפיות, אוכל כשר, תחנות דלק ולינה, ותחזית מזג
        אוויר. השימוש חינמי ולשימוש אישי.
      </p>

      <h3>דיוק המידע</h3>
      <ul>
        <li>
          המידע מגיע ממקורות פתוחים, בעיקר OpenStreetMap, שמתעדכן על ידי מתנדבים. הוא עלול להיות חסר, ישן או שגוי.
        </li>
        <li>
          <strong>כשרות:</strong> הסימון "כשר" מבוסס על תיוג במפה ולא על תעודת כשרות. בדקו את תעודת הכשרות במקום עצמו.
          גם הסיווג בשרי/חלבי הוא הערכה בלבד.
        </li>
        <li>
          <strong>שעות פתיחה ו"סגור בשבת":</strong> הערכה לפי נתוני המפה. כדאי לוודא מול המקום לפני שיוצאים.
        </li>
        <li>
          <strong>לינה בקק"ל ורשות הטבע:</strong> הרשימה לא מלאה. ייתכן שנדרשת הזמנה מראש או שהמקום סגור.
        </li>
        <li>
          <strong>מזג אוויר:</strong> תחזית בלבד. לפני טיול בשטח, בדקו אזהרות של השירות המטאורולוגי ושל רשות הטבע
          והגנים (למשל שיטפונות או עומסי חום).
        </li>
      </ul>

      <h3>נסיעה בטוחה</h3>
      <p>
        המסלול שמוצג אינו הוראת ניווט. נהגו לפי תמרורים, חוקי התנועה ותנאי הדרך, ואל תפעילו את האתר בזמן נהיגה.
        האחריות לבטיחות הנסיעה והטיול היא שלכם.
      </p>

      <h3>הגבלת אחריות</h3>
      <p>
        האתר ניתן כמות שהוא (AS IS), בלי התחייבות לזמינות, לדיוק או להתאמה למטרה מסוימת. בעל האתר לא יהיה אחראי לנזק
        שייגרם משימוש באתר או מהסתמכות על המידע בו, ככל שהחוק מתיר. האתר תלוי בשירותים חיצוניים חינמיים, וייתכן שלפעמים
        לא יעבוד.
      </p>

      <h3>שימוש מותר</h3>
      <p>
        אין להשתמש באתר כדי להעמיס על השירותים החיצוניים, למשל בהרצה אוטומטית של חיפושים רבים. אין לנסות לפגוע באתר או
        באבטחתו.
      </p>

      <h3>קניין רוחני ומקורות</h3>
      <ul>
        <li>
          נתוני המפה © תורמי{' '}
          <ExternalLink href="https://www.openstreetmap.org/copyright">OpenStreetMap</ExternalLink>, ברישיון ODbL.
        </li>
        <li>
          מסלולים: <ExternalLink href="https://valhalla.github.io/valhalla/">Valhalla</ExternalLink> ו-
          <ExternalLink href="https://project-osrm.org/">OSRM</ExternalLink>. אתרי טיול:{' '}
          <ExternalLink href="https://israelhiking.osm.org.il/">Israel Hiking Map</ExternalLink>. מזג אוויר:{' '}
          <ExternalLink href="https://open-meteo.com/">Open-Meteo</ExternalLink> (CC BY 4.0).
        </li>
        <li>העיצוב והקוד של האתר שייכים לבעל האתר.</li>
      </ul>

      <h3>דין וסמכות שיפוט</h3>
      <p>על התנאים יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית תהיה לבתי המשפט המוסמכים בישראל.</p>

      <h3>יצירת קשר</h3>
      <p>
        <Contact />
      </p>
    </>
  )
}

function AccessibilityStatement() {
  return (
    <>
      <p>
        אנחנו רוצים שכל אחד יוכל לתכנן טיול באתר, כולל אנשים עם מוגבלות. האתר נבנה לפי תקנות שוויון זכויות לאנשים עם
        מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, ולפי התקן הישראלי ת"י 5568, שמבוסס על הנחיות WCAG 2.0 ברמה AA.
      </p>

      <h3>מה נעשה באתר</h3>
      <ul>
        <li>אפשר להפעיל את כל הכפתורים, השדות והרשימות במקלדת בלבד. יש מסגרת מודגשת סביב הרכיב שבפוקוס.</li>
        <li>קישור "דילוג לחיפוש" בתחילת העמוד, לגישה מהירה לטופס.</li>
        <li>
          בשדות החיפוש אפשר לעבור בין ההצעות בחצים, לבחור ב-Enter ולסגור ב-Esc. קוראי מסך מקבלים את ההצעות כרשימה.
        </li>
        <li>לכל שדה יש תווית. לכפתורים שמוצג בהם רק סמל יש שם טקסטואלי.</li>
        <li>הודעות על טעינה, תוצאות ושגיאות מוקראות אוטומטית בקוראי מסך.</li>
        <li>ניגודיות צבעים לפי התקן, במצב בהיר ובמצב כהה.</li>
        <li>הגדלת טקסט עד 200% בלי לאבד תוכן, ותצוגה מותאמת לטלפון.</li>
        <li>מי שהגדיר במכשיר "הפחתת תנועה" יקבל אתר כמעט בלי אנימציות.</li>
        <li>כיוון מימין לשמאל ושפת העמוד מוגדרת כעברית.</li>
      </ul>

      <h3>מגבלות ידועות</h3>
      <ul>
        <li>
          המפה עצמה היא רכיב חזותי. כל המידע שמוצג עליה, כמו שם המקום, סוגו והמרחק מהמסלול, מופיע גם ברשימת המקומות
          שבצד, ואפשר להשתמש בה בלי המפה.
        </li>
        <li>
          תוכן שמגיע משירותים חיצוניים (שמות מקומות, אריחי המפה) לא בשליטתנו המלאה, וייתכן שלא כולו מונגש.
        </li>
      </ul>
      <p>אם נתקלתם בבעיית נגישות, נשמח לשמוע ולתקן.</p>

      <h3>רכז נגישות ויצירת קשר</h3>
      <p>
        <Contact />
      </p>
      <p>ההצהרה עודכנה ב-{UPDATED}.</p>
    </>
  )
}

const CONTENT: Record<LegalPageId, () => ReactNode> = {
  privacy: PrivacyPolicy,
  terms: TermsOfUse,
  accessibility: AccessibilityStatement,
}

/** Full-screen dialog for one legal page. Escape or the close button returns to the app. */
export function LegalPage({ page, onClose }: { page: LegalPageId; onClose: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const title = LEGAL_PAGES.find((p) => p.id === page)?.title ?? ''
  const Content = CONTENT[page]

  useEffect(() => {
    headingRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [page, onClose])

  return (
    <div className="legal-backdrop" onClick={onClose}>
      <div
        className="legal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="legal-header">
          <h2 id="legal-title" ref={headingRef} tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="legal-close" onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>
        <nav className="legal-tabs" aria-label="מידע משפטי">
          {LEGAL_PAGES.map((p) => (
            <a key={p.id} href={`#${p.id}`} aria-current={p.id === page ? 'page' : undefined}>
              {p.title}
            </a>
          ))}
        </nav>
        <div className="legal-body">
          <Content />
          <p className="legal-updated">עדכון אחרון: {UPDATED}</p>
        </div>
      </div>
    </div>
  )
}

export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="מידע משפטי">
        {LEGAL_PAGES.map((p) => (
          <a key={p.id} href={`#${p.id}`}>
            {p.title}
          </a>
        ))}
      </nav>
      <p>
        נתוני מפה ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          תורמי OpenStreetMap
        </a>
      </p>
    </footer>
  )
}
