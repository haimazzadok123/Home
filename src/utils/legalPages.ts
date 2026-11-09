export type LegalPageId = 'privacy' | 'terms' | 'accessibility'

export const LEGAL_PAGES: Array<{ id: LegalPageId; title: string }> = [
  { id: 'privacy', title: 'מדיניות פרטיות' },
  { id: 'terms', title: 'תנאי שימוש' },
  { id: 'accessibility', title: 'הצהרת נגישות' },
]
