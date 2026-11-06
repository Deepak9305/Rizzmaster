const GENERATION_KEY = 'rizz_web_ebook_generations';
let coverPreloaded = false;

export function preloadEbookCover(): void {
  if (coverPreloaded || typeof Image === 'undefined') return;
  coverPreloaded = true;
  const cover = new Image();
  cover.onerror = () => {
    cover.onerror = null;
    cover.src = '/promotions/make-her-think-about-you-cover.png';
  };
  cover.src = '/promotions/make-her-think-about-you-cover.webp';
}

export function isEbookPromotionDue(count: number): boolean {
  return count >= 2 && (count - 2) % 5 === 0;
}

export function readEbookGenerationCount(): number {
  try {
    const count = Number(sessionStorage.getItem(GENERATION_KEY));
    return Number.isSafeInteger(count) && count >= 0 ? count : 0;
  } catch {
    return 0;
  }
}

export function saveEbookGenerationCount(count: number): void {
  try { sessionStorage.setItem(GENERATION_KEY, String(count)); } catch { /* In-memory counting still works. */ }
}
