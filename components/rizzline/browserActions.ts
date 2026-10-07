export async function copyLine(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* Older browsers can still use the selection fallback. */ }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:16px';
  document.body.appendChild(field);
  field.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Copy unavailable');
  } finally {
    field.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

export async function shareLine(text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Rizzline · Rizz Master', text });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  await copyLine(text);
  return 'copied';
}

export async function downloadLineCard(text: string, category: string, theme: string): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export unavailable');
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, theme === 'midnight' ? '#30154a' : theme === 'sunset' ? '#492017' : '#45132e');
  gradient.addColorStop(1, '#09060f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = '#f9a8d4';
  ctx.lineWidth = 2;
  ctx.strokeRect(55, 55, 970, 1240);
  ctx.fillStyle = '#f9a8d4';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('RIZZLINE / RIZZ MASTER', 100, 160);
  ctx.font = '24px sans-serif';
  ctx.fillText(category.toUpperCase(), 100, 235);
  let lines: string[] = [];
  let fontSize = 62;
  // Fit long lines in the card without clipping text.
  do {
    ctx.font = `bold ${fontSize}px sans-serif`;
    lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > 880 && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length * fontSize * 1.3 <= 760) break;
    fontSize -= 4;
  } while (fontSize > 30);
  ctx.fillStyle = '#ffffff';
  const start = Math.max(380, 680 - (lines.length - 1) * fontSize * 0.65);
  lines.forEach((line, index) => ctx.fillText(line, 100, start + index * fontSize * 1.3));
  ctx.font = '28px sans-serif';
  ctx.fillStyle = '#d4b8ce';
  ctx.fillText('rizzmaster.online/rizzline', 100, 1220);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image export failed')), 'image/png'));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'rizzline-pickup-line.png';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
