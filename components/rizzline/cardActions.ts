export const CARD_THEMES = [
  { id: 'rose', name: 'Rose', accent: '#fb7185', start: '#431426' },
  { id: 'midnight', name: 'Midnight', accent: '#c4b5fd', start: '#291c4a' },
  { id: 'sunset', name: 'Sunset', accent: '#fbbf24', start: '#452616' },
  { id: 'emerald', name: 'Emerald', accent: '#6ee7b7', start: '#123b30' },
] as const;

interface CardBranding {
  brand?: string;
  url?: string;
}

interface CardShareOptions {
  title?: string;
  filename?: string;
}

function wrapCardText(ctx: CanvasRenderingContext2D, text: string): string[] {
  const lines: string[] = [];
  for (const paragraph of text.trim().split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= 880) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      // Break long URLs/words too, without splitting UTF-16 surrogate pairs.
      for (const character of Array.from(word)) {
        if (line && ctx.measureText(line + character).width > 880) { lines.push(line); line = ''; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function createLineCard(text: string, category: string, themeId: string, name = '', branding: CardBranding = {}): Promise<Blob> {
  await document.fonts?.ready;
  const theme = CARD_THEMES.find(item => item.id === themeId) || CARD_THEMES[0];
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export unavailable');
  let lines: string[] = [];
  let fontSize = 68;
  while (true) {
    ctx.font = `600 ${fontSize}px "Space Grotesk", sans-serif`;
    lines = wrapCardText(ctx, text);
    if (lines.length * fontSize * 1.3 <= 680 || fontSize <= 24) break;
    fontSize -= 2;
  }
  // Normal replies stay 4:5. Exceptionally long replies get a taller export,
  // preserving every word instead of clipping or shrinking below readable size.
  canvas.height = Math.max(1350, Math.ceil(lines.length * fontSize * 1.3 + 670));
  const gradient = ctx.createLinearGradient(0, 0, 1080, canvas.height);
  gradient.addColorStop(0, theme.start);
  gradient.addColorStop(0.6, '#111116');
  gradient.addColorStop(1, '#09090d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, canvas.height);
  ctx.strokeStyle = `${theme.accent}66`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(50, 50, 980, canvas.height - 100, 46); ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.accent;
  ctx.font = '600 28px "Space Grotesk", sans-serif';
  ctx.fillText(category.toUpperCase(), 100, 145);
  ctx.font = '400 180px Georgia, serif';
  ctx.fillStyle = `${theme.accent}66`;
  ctx.fillText('“', 93, 370);
  ctx.font = `600 ${fontSize}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = '#fafafa';
  const start = 340 + (canvas.height - 670) / 2 - (lines.length - 1) * fontSize * 0.65;
  lines.forEach((line, index) => ctx.fillText(line, 100, start + index * fontSize * 1.3));
  ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(100, canvas.height - 250); ctx.lineTo(980, canvas.height - 250); ctx.stroke();
  ctx.font = '600 34px "Space Grotesk", sans-serif'; ctx.fillStyle = theme.accent;
  ctx.fillText(branding.brand || 'Rizzline', 100, canvas.height - 190);
  ctx.font = '400 26px "Space Grotesk", sans-serif'; ctx.fillStyle = '#a1a1aa'; ctx.textAlign = 'right';
  ctx.fillText(name.trim() ? `— ${name.trim().slice(0, 32)}` : 'by Rizz Master', 980, canvas.height - 190, 580);
  ctx.textAlign = 'left'; ctx.font = '400 22px "Space Grotesk", sans-serif';
  ctx.fillText(branding.url || 'rizzmaster.online/rizzline-pickup-lines', 100, canvas.height - 115);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png'));
}

export function downloadCardBlob(blob: Blob, filename = 'rizzline-pickup-line.png'): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function shareCardBlob(blob: Blob, options: CardShareOptions = {}): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const filename = options.filename || 'rizzline-pickup-line.png';
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ title: options.title || 'Rizzline', files: [file] }); return 'shared'; }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  downloadCardBlob(blob, filename);
  return 'downloaded';
}
