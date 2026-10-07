import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG_BY_ID, CURATED_PICKUP_LINES, LINES_BY_CATEGORY } from './data/curatedLines';
import { getRandomPickupLine } from './services/pickupLineApi';
import { appendLine, createBrowseState, previousLine } from './utils/browseHistory';
import { copyLine, downloadLineCard, shareLine } from './browserActions';
import { useLocalCollection } from './useLocalCollection';
import { RIZZLINE_CATEGORIES } from './pageContent';
import type { CategoryKey, PickupLine, RizzReaction } from './types';

const buttonClass = 'min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/90 transition-colors hover:border-pink-300/60 hover:bg-pink-400/10 disabled:opacity-40 disabled:cursor-not-allowed';
const categories = [{ id: 'all', label: 'All vibes', emoji: '✨' }, ...RIZZLINE_CATEGORIES];
function readReactions(): Record<string, RizzReaction> {
  try {
    const data: unknown = JSON.parse(localStorage.getItem('rizzmaster_rizzline_reactions_v1') || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([id, value]) => CATALOG_BY_ID.has(id) && ['fire', 'cheesy', 'cringe'].includes(value)));
  } catch { return {}; }
}

export default function RizzlineTool() {
  const [category, setCategory] = useState<CategoryKey>('all');
  const [browse, setBrowse] = useState(() => createBrowseState(CURATED_PICKUP_LINES[0]));
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [limit, setLimit] = useState(6);
  const [notice, setNotice] = useState('');
  const [reactions, setReactions] = useState(readReactions);
  const [cardLine, setCardLine] = useState<PickupLine | null>(null);
  const [theme, setTheme] = useState('rose');
  const [exporting, setExporting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardButtonRef = useRef<HTMLButtonElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const { savedIds, setSavedIds, storageAvailable } = useLocalCollection();
  const saved = useMemo(() => new Set(savedIds), [savedIds]);
  const current = browse.lines[browse.index];
  const currentCategory = RIZZLINE_CATEGORIES.find(item => item.id === current.category);
  const matches = useMemo(() => {
    const pool = savedOnly ? savedIds.map(id => CATALOG_BY_ID.get(id)!).filter(Boolean) : LINES_BY_CATEGORY[category];
    const term = query.trim().toLocaleLowerCase();
    return pool.filter(line => (category === 'all' || line.category === category) && (!term || line.text.toLocaleLowerCase().includes(term)));
  }, [category, query, savedOnly, savedIds]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    try { localStorage.setItem('rizzmaster_rizzline_reactions_v1', JSON.stringify(reactions)); } catch { /* Reactions remain usable for this visit. */ }
  }, [reactions]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (cardLine && dialog && !dialog.open) dialog.showModal();
    else if (!cardLine && dialog?.open) dialog.close();
  }, [cardLine]);

  const next = () => setBrowse(state => appendLine(state, getRandomPickupLine(category, state.lines[state.index].text).line));
  const previous = () => setBrowse(state => previousLine(state));
  const chooseCategory = (id: CategoryKey) => {
    setCategory(id);
    setLimit(6);
    setBrowse(state => appendLine(state, getRandomPickupLine(id, state.lines[state.index].text).line));
  };
  const toggleSave = (line: PickupLine) => {
    if (!saved.has(line.id) && savedIds.length >= 500) { setNotice('Your collection has 500 lines. Remove a saved line to make room.'); return; }
    setSavedIds(ids => ids.includes(line.id) ? ids.filter(id => id !== line.id) : [line.id, ...ids]);
  };
  const closeCard = () => { setCardLine(null); cardButtonRef.current?.focus({ preventScroll: true }); };
  const copy = async (line: PickupLine) => {
    try { await copyLine(line.text); setNotice('Line copied. Make it your own.'); }
    catch { setNotice('Copy is unavailable. You can select the line and copy it manually.'); }
  };
  const share = async () => {
    try {
      const result = await shareLine(current.text);
      if (result !== 'cancelled') setNotice(result === 'shared' ? 'Line shared.' : 'Line copied — paste it into your favorite app.');
    } catch { setNotice('Sharing is unavailable. Select the line to copy it manually.'); }
  };
  const exportCard = async () => {
    if (!cardLine || exporting) return;
    setExporting(true);
    try { await downloadLineCard(cardLine.text, cardLine.category, theme); setNotice('Your card is ready. Check your downloads.'); }
    catch { setNotice('The card could not be downloaded. Please try again.'); }
    finally { setExporting(false); }
  };

  return <section id="rizzline-tool" aria-labelledby="rizzline-tool-heading" className="scroll-mt-6">
    <div className="overflow-hidden rounded-[1.75rem] border border-pink-300/20 bg-gradient-to-br from-pink-500/[0.08] via-[#100b15] to-purple-500/[0.07] shadow-[0_20px_70px_rgba(0,0,0,0.3)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-7">
        <div><h2 id="rizzline-tool-heading" className="text-lg font-bold text-white">Find your next opener</h2><p className="mt-1 text-xs text-white/60">{CURATED_PICKUP_LINES.length.toLocaleString('en-US')} lines · Free · No account needed</p></div>
        <button type="button" aria-pressed={savedOnly} onClick={() => { setSavedOnly(!savedOnly); setLimit(6); setQuery(''); }} className={buttonClass}>{savedOnly ? 'Browse all' : `♡ Saved (${savedIds.length})`}</button>
      </div>
      <div className="px-5 pt-5 sm:px-7">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Pickup line categories">
          {categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => chooseCategory(item.id as CategoryKey)} className={`min-h-[44px] rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${category === item.id ? 'border-pink-300/60 bg-pink-300/15 text-pink-100' : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/30 hover:text-white'}`}><span aria-hidden="true">{item.emoji} </span>{item.label}</button>)}
        </div>
        <div className="my-6 rounded-2xl border border-white/10 bg-black/25 p-5 sm:p-8" style={{ touchAction: 'pan-y' }} tabIndex={0} aria-label="Pickup line card. Use left and right arrow keys to browse."
          onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight') { event.preventDefault(); next(); } else if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); } }}
          onPointerDown={event => { if (event.pointerType !== 'mouse' && !(event.target as HTMLElement).closest('button')) pointerStart.current = { x: event.clientX, y: event.clientY }; }}
          onPointerCancel={() => { pointerStart.current = null; }}
          onPointerUp={event => { const start = pointerStart.current; pointerStart.current = null; if (!start) return; const dx = event.clientX - start.x; const dy = event.clientY - start.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else previous(); } }}>
          <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-[0.18em] text-pink-200">{currentCategory?.emoji} {currentCategory?.label || current.category}</span><button type="button" onClick={() => toggleSave(current)} aria-pressed={saved.has(current.id)} aria-label={saved.has(current.id) ? 'Unsave current line' : 'Save current line'} className={buttonClass}>{saved.has(current.id) ? '♥ Saved' : '♡ Save'}</button></div>
          <div className="flex min-h-[180px] items-center py-6 sm:min-h-[200px]" aria-live="polite" aria-atomic="true"><p className="text-2xl font-bold leading-snug tracking-tight text-white sm:text-3xl">“{current.text}”</p></div>
          <p className="border-t border-white/10 pt-4 text-sm leading-6 text-white/65"><span className="font-semibold text-pink-200">Delivery tip: </span>{current.deliveryTip}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Your reaction to this line">
            <span className="mr-2 text-xs text-white/60">Your take</span>
            {([{ id: 'fire', label: '🔥 Love it' }, { id: 'cheesy', label: '🧀 Cheesy' }, { id: 'cringe', label: '😅 Not for me' }] as const).map(item => <button type="button" key={item.id} aria-pressed={reactions[current.id] === item.id} onClick={() => setReactions(state => { const updated = { ...state }; if (updated[current.id] === item.id) delete updated[current.id]; else updated[current.id] = item.id; return updated; })} className={`min-h-[44px] rounded-full border px-3 py-2 text-xs font-semibold ${reactions[current.id] === item.id ? 'border-pink-300/60 bg-pink-300/15 text-pink-100' : 'border-white/10 text-white/70'}`}>{item.label}</button>)}
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-3"><button type="button" disabled={browse.index === 0} onClick={previous} className={buttonClass} aria-label="Previous pickup line">← Previous</button><button type="button" onClick={next} className="marketing-cta-primary min-h-[48px] rounded-xl px-5 py-3 text-sm font-black text-white">Next line →</button></div>
        <div className="mt-3 grid grid-cols-3 gap-2"><button type="button" onClick={() => void copy(current)} className={buttonClass}>Copy</button><button type="button" onClick={() => void share()} className={buttonClass}>Share</button><button type="button" ref={cardButtonRef} onClick={() => setCardLine(current)} className={buttonClass}>Make card</button></div>
        <p className="mt-4 text-xs leading-5 text-white/60">Saved lines and reactions stay in this browser. <a href="/privacy" className="underline underline-offset-4 hover:text-pink-200">Privacy</a></p>
        {!storageAvailable && <p role="status" className="mt-2 text-sm text-amber-200">Browser storage is unavailable. Your collection will last for this visit only.</p>}
      </div>
      <div className="mt-6 border-t border-white/10 p-5 sm:p-7">
        <label htmlFor="rizzline-search" className="block text-sm font-bold text-white">{savedOnly ? 'Search your saved lines' : 'Search the pickup line catalog'}</label>
        <input id="rizzline-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(6); }} placeholder="Try coffee, smile, games…" maxLength={100} className="mt-3 w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-base text-white placeholder:text-white/50 focus:border-pink-300" />
        <p className="mt-3 text-xs text-white/65" role="status">{matches.length} {savedOnly ? 'saved' : 'matching'} lines{category !== 'all' ? ` in ${category}` : ''}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {matches.slice(0, limit).map(line => <li key={line.id} className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-sm leading-6 text-white/85">{line.text}</p><div className="mt-4 flex items-center justify-between gap-2"><button type="button" onClick={() => { setBrowse(state => appendLine(state, line)); document.getElementById('rizzline-tool-heading')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }} className="min-h-[44px] text-xs font-bold text-pink-200 hover:underline">Use this line ↑</button><button type="button" onClick={() => toggleSave(line)} aria-pressed={saved.has(line.id)} aria-label={`${saved.has(line.id) ? 'Unsave' : 'Save'}: ${line.text}`} className={buttonClass}>{saved.has(line.id) ? '♥' : '♡'}</button></div></li>)}
        </ul>
        {!matches.length && <p className="py-6 text-sm text-white/65">{savedOnly ? 'No saved lines match. Save a line or try another category.' : 'No lines match. Try a shorter search or another vibe.'}</p>}
        {matches.length > limit && <button type="button" className={`${buttonClass} mt-5 w-full`} onClick={() => setLimit(value => value + 12)}>Show more lines</button>}
      </div>
    </div>
    <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[400] w-[min(90vw,28rem)] -translate-x-1/2">{notice && <p className="rounded-xl border border-pink-300/30 bg-[#211022] px-5 py-4 text-sm text-pink-100 shadow-xl">{notice}</p>}</div>
    <dialog ref={dialogRef} aria-labelledby="rizzline-card-title" onCancel={closeCard} onClose={() => { setCardLine(null); cardButtonRef.current?.focus({ preventScroll: true }); }} className="m-auto max-h-[90dvh] w-[min(92vw,30rem)] overflow-y-auto rounded-2xl border border-pink-300/30 bg-[#100b15] p-6 text-white backdrop:bg-black/75">
      <div className="flex items-center justify-between gap-3"><h2 id="rizzline-card-title" className="text-xl font-bold">Make an icebreaker card</h2><button type="button" autoFocus onClick={closeCard} className={buttonClass} aria-label="Close card maker">×</button></div>
      <div className={`my-5 rounded-2xl border border-white/15 p-7 ${theme === 'midnight' ? 'bg-purple-950' : theme === 'sunset' ? 'bg-orange-950' : 'bg-pink-950'}`}><p className="text-xs font-bold uppercase tracking-widest text-pink-200">Rizzline · Rizz Master</p><p className="my-8 text-2xl font-bold leading-snug">{cardLine?.text}</p><p className="text-xs text-white/65">rizzmaster.online/rizzline</p></div>
      <label htmlFor="rizzline-card-theme" className="text-sm font-semibold">Card color</label><select id="rizzline-card-theme" value={theme} onChange={event => setTheme(event.target.value)} className="mt-2 w-full rounded-xl border border-white/20 bg-[#100b15] p-3"><option value="rose">Rose</option><option value="midnight">Midnight</option><option value="sunset">Sunset</option></select>
      <button type="button" disabled={exporting} onClick={() => void exportCard()} className="marketing-cta-primary mt-5 min-h-[48px] w-full rounded-xl px-5 py-3 font-bold disabled:opacity-50">{exporting ? 'Preparing card…' : 'Download PNG card'}</button>
    </dialog>
  </section>;
}
