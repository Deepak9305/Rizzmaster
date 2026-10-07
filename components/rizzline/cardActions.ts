export const CARD_THEMES = [
  { id: 'rose', name: 'Rose', accent: '#fb7185', start: '#431426' },
  { id: 'midnight', name: 'Midnight', accent: '#c4b5fd', start: '#291c4a' },
  { id: 'sunset', name: 'Sunset', accent: '#fbbf24', start: '#452616' },
  { id: 'emerald', name: 'Emerald', accent: '#6ee7b7', start: '#123b30' },
] as const;

export async function createLineCard(text: string, category: string, themeId: string, name = ''): Promise<Blob> {
  await document.fonts?.ready;
  const theme = CARD_THEMES.find(item => item.id === themeId) || CARD_THEMES[0];
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export unavailable');
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, theme.start);
  gradient.addColorStop(0.6, '#111116');
  gradient.addColorStop(1, '#09090d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = `${theme.accent}66`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(50, 50, 980, 1250, 46); ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.accent;
  ctx.font = '600 28px "Space Grotesk", sans-serif';
  ctx.fillText(category.toUpperCase(), 100, 145);
  ctx.font = '400 180px Georgia, serif';
  ctx.fillStyle = `${theme.accent}66`;
  ctx.fillText('“', 93, 370);
  let lines: string[] = [];
  let fontSize = 68;
  do {
    ctx.font = `600 ${fontSize}px "Space Grotesk", sans-serif`;
    lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > 880 && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length * fontSize * 1.3 <= 680) break;
    fontSize -= 2;
  } while (fontSize > 24);
  ctx.fillStyle = '#fafafa';
  const start = 675 - (lines.length - 1) * fontSize * 0.65;
  lines.forEach((line, index) => ctx.fillText(line, 100, start + index * fontSize * 1.3));
  ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(100, 1100); ctx.lineTo(980, 1100); ctx.stroke();
  ctx.font = '600 34px "Space Grotesk", sans-serif'; ctx.fillStyle = theme.accent;
  ctx.fillText('Rizzline', 100, 1160);
  ctx.font = '400 26px "Space Grotesk", sans-serif'; ctx.fillStyle = '#a1a1aa'; ctx.textAlign = 'right';
  ctx.fillText(name.trim() ? `— ${name.trim().slice(0, 32)}` : 'by Rizz Master', 980, 1160, 580);
  ctx.textAlign = 'left'; ctx.font = '400 22px "Space Grotesk", sans-serif';
  ctx.fillText('rizzmaster.online/rizzline', 100, 1235);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png'));
}

export function downloadCardBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'rizzline-pickup-line.png';
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function shareCardBlob(blob: Blob): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], 'rizzline-pickup-line.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ title: 'Rizzline', files: [file] }); return 'shared'; }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  downloadCardBlob(blob);
  return 'downloaded';
}
