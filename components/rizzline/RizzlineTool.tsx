import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, CATALOG_BY_ID, CURATED_PICKUP_LINES } from './data/curatedLines';
import { getRandomPickupLine } from './services/pickupLineApi';
import { appendLine, createBrowseState, previousLine } from './utils/browseHistory';
import { copyLine, downloadLineCard, shareLine } from './browserActions';
import { useLocalCollection } from './useLocalCollection';
import type { CategoryKey, PickupLine, RizzReaction } from './types';

const DEFAULT_REACTIONS = { fire: 240, cheesy: 65, cringe: 14 };
const buttonBase = 'flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-all active:scale-[0.97]';

const categoryThemes: Record<string, { active: string; badge: string; glow: string }> = {
  all: { active: 'from-rose-500 via-rose-600 to-amber-500 border-rose-400/90 text-white', badge: 'bg-black/30 text-white', glow: 'shadow-[0_0_10px_rgba(244,63,94,0.3)]' },
  smooth: { active: 'from-amber-500 to-amber-600 border-amber-400/90 text-white', badge: 'bg-black/30 text-amber-100', glow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]' },
  cheesy: { active: 'from-yellow-400 to-amber-500 border-yellow-300/90 text-zinc-950', badge: 'bg-black/30 text-zinc-950', glow: 'shadow-[0_0_10px_rgba(234,179,8,0.3)]' },
  nerdy: { active: 'from-cyan-500 to-blue-600 border-cyan-300/90 text-white', badge: 'bg-black/30 text-cyan-100', glow: 'shadow-[0_0_10px_rgba(6,182,212,0.3)]' },
  romantic: { active: 'from-rose-600 to-pink-600 border-rose-300/90 text-white', badge: 'bg-black/30 text-rose-100', glow: 'shadow-[0_0_10px_rgba(225,29,72,0.3)]' },
  funny: { active: 'from-orange-500 to-amber-600 border-orange-300/90 text-white', badge: 'bg-black/30 text-orange-100', glow: 'shadow-[0_0_10px_rgba(249,115,22,0.3)]' },
  foodie: { active: 'from-red-500 to-orange-600 border-red-300/90 text-white', badge: 'bg-black/30 text-red-100', glow: 'shadow-[0_0_10px_rgba(239,68,68,0.3)]' },
  clever: { active: 'from-purple-500 to-indigo-600 border-purple-300/90 text-white', badge: 'bg-black/30 text-purple-100', glow: 'shadow-[0_0_10px_rgba(168,85,247,0.3)]' },
};

const getReactionCounts = (line: PickupLine) => line.reactions || {
  fire: DEFAULT_REACTIONS.fire + ((Number(line.id.split('-').pop()) || 0) * 37) % 350,
  cheesy: DEFAULT_REACTIONS.cheesy + ((Number(line.id.split('-').pop()) || 0) * 23) % 180,
  cringe: DEFAULT_REACTIONS.cringe + ((Number(line.id.split('-').pop()) || 0) * 11) % 40,
};

function readReactions(): Record<string, RizzReaction> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('rizzmaster_rizzline_reactions_v1') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, reaction]) => CATALOG_BY_ID.has(id) && ['fire', 'cheesy', 'cringe'].includes(String(reaction)))) as Record<string, RizzReaction>;
  } catch { return {}; }
}

function RizzlineLogo() {
  return <a href="/rizzline" className="flex min-w-0 items-center gap-2.5" aria-label="Rizzline home"><img src="/rizzline-logo.png" width="38" height="38" alt="" className="h-[38px] w-[38px] shrink-0 object-contain drop-shadow-[0_4px_12px_rgba(255,46,117,0.45)]" /><span className="truncate text-lg font-bold tracking-tight text-zinc-100">Rizzline</span></a>;
}

function CategoryRail({ category, onChange }: { category: CategoryKey; onChange: (category: CategoryKey) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  const current = CATEGORIES.find(item => item.id === category) || CATEGORIES[0];
  useEffect(() => {
    const active = railRef.current?.querySelector<HTMLElement>(`#rizzline-category-${category}`);
    if (active && railRef.current) railRef.current.scrollTo({ left: active.offsetLeft - (railRef.current.clientWidth - active.clientWidth) / 2, behavior: 'auto' });
  }, [category]);
  return <div className="w-full shrink-0 px-4 py-1 sm:px-6"><div className="mb-2 flex items-center justify-between px-0.5 text-xs"><div className="flex min-w-0 items-center gap-2"><span className="font-bold uppercase tracking-wider text-zinc-500">Vibe</span><span className="text-zinc-600">•</span><span className="truncate font-semibold text-rose-400">{current.emoji} {current.label}</span></div><span className="shrink-0 font-mono text-zinc-500">8 Vibes</span></div><div ref={railRef} className="no-scrollbar flex min-w-0 snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-0.5 pb-1" aria-label="Pickup line vibes">{CATEGORIES.map(item => { const selected = item.id === category; const theme = categoryThemes[item.id] || categoryThemes.all; return <button key={item.id} id={`rizzline-category-${item.id}`} type="button" aria-pressed={selected} onClick={() => onChange(item.id)} className={`relative flex h-11 min-w-[6.7rem] shrink-0 snap-center items-center justify-center gap-1.5 overflow-hidden rounded-[1.25rem] border px-3 py-1.5 text-center transition-[color,border-color,background-color,box-shadow] duration-100 ${selected ? `bg-gradient-to-r ${theme.active} ${theme.glow}` : 'border-zinc-800/80 bg-zinc-900/70 text-zinc-400 hover:border-rose-500/50 hover:bg-zinc-900 hover:text-zinc-200'}`}><span className="shrink-0 text-lg drop-shadow-sm" aria-hidden="true">{item.emoji}</span><span className="min-w-0 truncate text-xs font-semibold tracking-tight">{item.label}</span><span className={`hidden rounded px-1 py-0.5 font-mono text-[8px] leading-none sm:inline-flex ${selected ? theme.badge : 'bg-zinc-800 text-zinc-400'}`}>{item.id === 'all' ? CURATED_PICKUP_LINES.length : '•'}</span></button>; })}</div></div>;
}

function SavedSheet({ lines, onClose, onRemove, onClear, onSelect }: { lines: PickupLine[]; onClose: () => void; onRemove: (id: string) => void; onClear: () => void; onSelect: (line: PickupLine) => void }) {
  return <><button type="button" aria-label="Close saved lines" onClick={onClose} className="fixed inset-0 z-40 bg-black/80" /><section role="dialog" aria-modal="true" aria-label="Saved lines" className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90svh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border-t border-white/[0.09] bg-[#111116] pb-[env(safe-area-inset-bottom)] shadow-[0_-20px_70px_rgba(0,0,0,0.55)]"><div className="mx-auto mb-1 mt-3 h-1.5 w-12 rounded-full bg-zinc-700/80" /><div className="flex items-center justify-between border-b border-white/[0.07] px-5 pb-3 pt-2"><div className="flex min-h-10 items-center gap-2 rounded-2xl border border-white/[0.07] bg-zinc-950/80 px-3.5 py-1.5 text-xs font-bold text-white"><span aria-hidden="true">▣</span><span>Saved</span><span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px]">{lines.length}</span></div><div className="flex items-center gap-2">{lines.length > 0 && <button type="button" onClick={onClear} className="min-h-11 rounded-xl p-2 text-xs text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400">Clear</button>}<button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-xl text-zinc-400 hover:bg-white/[0.07] hover:text-white" aria-label="Close saved lines">×</button></div></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">{lines.length === 0 ? <div className="py-16 text-center text-zinc-500"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900/80 text-3xl text-rose-400">♥</div><p className="mt-4 text-sm font-bold text-zinc-200">No saved lines yet</p><p className="mt-1 text-xs text-zinc-400">Tap the heart on a line to keep it here.</p></div> : lines.map(line => <article key={line.id} className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4"><p className="text-sm font-medium leading-relaxed text-zinc-200">“{line.text}”</p><div className="flex items-center justify-between gap-2 pt-1"><span className="rounded-md border border-zinc-800/80 bg-zinc-900 px-2.5 py-0.5 text-xs capitalize text-zinc-400">{line.category}</span><div className="flex items-center gap-1"><button type="button" onClick={() => { onSelect(line); onClose(); }} className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.08] hover:text-white" aria-label="Load saved line">↗</button><button type="button" onClick={() => onRemove(line.id)} className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-rose-500/20 hover:text-rose-400" aria-label="Remove saved line">×</button></div></div></article>)}</div></section></>;
}

function CardModal({ line, onClose }: { line: PickupLine; onClose: () => void }) {
  const [theme, setTheme] = useState('rose'); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await downloadLineCard(line.text, line.category, theme); } finally { setBusy(false); } };
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-3 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="rizzline-card-title"><div className="relative z-10 flex max-h-[calc(100svh-1.5rem)] w-full max-w-sm flex-col gap-3.5 overflow-y-auto rounded-[2rem] border border-white/[0.09] bg-[#111116] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.58)] sm:p-5"><div className="flex items-center justify-between"><div><h2 id="rizzline-card-title" className="text-sm font-bold text-zinc-100">Love Note Card</h2><p className="text-[11px] text-zinc-400">Create a romantic card for stories & DMs</p></div><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-zinc-400 hover:bg-white/[0.07] hover:text-white" aria-label="Close love note card preview">×</button></div><div className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/[0.07] bg-zinc-950/60 p-1">{['rose', 'midnight', 'sunset'].map(value => <button type="button" key={value} onClick={() => setTheme(value)} className={`min-h-10 flex-1 rounded-xl py-1.5 text-xs font-semibold capitalize ${theme === value ? 'bg-zinc-800 text-rose-300' : 'text-zinc-500'}`}>{value}</button>)}</div><label className="space-y-1"><span className="flex items-center justify-between px-1 text-[11px] font-semibold text-zinc-400"><span>Name on card</span><span className="font-normal text-zinc-600">Optional</span></span><input type="text" value={name} maxLength={32} onChange={event => setName(event.target.value)} placeholder="e.g. Alex" className="min-h-11 w-full rounded-2xl border border-white/[0.08] bg-white/[0.045] px-3.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-rose-500/60" /></label><div className={`relative flex min-h-[250px] w-full flex-col justify-between overflow-hidden rounded-3xl border border-rose-500/40 ${theme === 'midnight' ? 'bg-gradient-to-br from-purple-950 via-zinc-900 to-zinc-950' : theme === 'sunset' ? 'bg-gradient-to-br from-amber-950 via-zinc-900 to-zinc-950' : 'bg-gradient-to-br from-rose-950 via-zinc-900 to-zinc-950'} p-5 text-center shadow-2xl`}><div className="flex items-center justify-between"><span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-rose-200">{line.category}</span><span className="text-rose-400">♥</span></div><p className="my-auto py-3.5 text-base font-semibold leading-relaxed text-zinc-100">“{line.text}”</p><div className="flex items-center justify-between border-t border-white/10 pt-3 text-[11px] font-mono text-zinc-400"><span className="font-semibold text-zinc-200">♥ Rizzline</span><span>{name.trim() ? `— ${name.trim()}` : 'Add your name'}</span></div></div><button type="button" disabled={busy} onClick={() => void save()} className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-rose-500 via-rose-600 to-amber-500 py-3 text-xs font-bold tracking-wide text-white shadow-lg shadow-rose-500/25 disabled:opacity-60">{busy ? 'Preparing Story Image…' : 'Save PNG'}</button></div></div>;
}

export default function RizzlineTool() {
  const [category, setCategory] = useState<CategoryKey>('all'); const [browse, setBrowse] = useState(() => createBrowseState(getRandomPickupLine('all').line)); const [savedOpen, setSavedOpen] = useState(false); const [tipOpen, setTipOpen] = useState(false); const [cardLine, setCardLine] = useState<PickupLine | null>(null); const [notice, setNotice] = useState(''); const [reactions, setReactions] = useState<Record<string, RizzReaction>>(readReactions); const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const { savedIds, setSavedIds } = useLocalCollection(); const current = browse.lines[browse.index]; const saved = useMemo(() => new Set(savedIds), [savedIds]); const savedLines = useMemo(() => savedIds.map(id => CATALOG_BY_ID.get(id)).filter(Boolean) as PickupLine[], [savedIds]); const counts = getReactionCounts(current); const total = counts.fire + counts.cheesy + counts.cringe; const categoryInfo = CATEGORIES.find(item => item.id === current.category) || CATEGORIES[0]; const theme = categoryThemes[current.category] || categoryThemes.smooth;
  useEffect(() => { try { localStorage.setItem('rizzmaster_rizzline_reactions_v1', JSON.stringify(reactions)); } catch {} }, [reactions]); useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2500); return () => window.clearTimeout(timer); }, [notice]); useEffect(() => { setTipOpen(false); }, [current.id]);
  const next = () => setBrowse(state => appendLine(state, getRandomPickupLine(category, state.lines[state.index].text).line)); const previous = () => setBrowse(state => previousLine(state)); const selectCategory = (nextCategory: CategoryKey) => { setCategory(nextCategory); setBrowse(state => appendLine(state, getRandomPickupLine(nextCategory, state.lines[state.index].text).line)); }; const toggleSave = (line: PickupLine) => setSavedIds(ids => ids.includes(line.id) ? ids.filter(id => id !== line.id) : [line.id, ...ids].slice(0, 500)); const react = (reaction: RizzReaction) => setReactions(state => { const nextState = { ...state }; if (nextState[current.id] === reaction) delete nextState[current.id]; else nextState[current.id] = reaction; return nextState; }); const copy = async () => { try { await copyLine(current.text); setNotice('Copied!'); } catch { setNotice('Could not copy this line.'); } }; const share = async () => { try { const result = await shareLine(`“${current.text}”\n\n✨ [${current.category.toUpperCase()}] • via Rizzline`); if (result !== 'cancelled') setNotice(result === 'shared' ? 'Shared!' : 'Copied!'); } catch { setNotice('Could not share this line.'); } };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => { if (event.pointerType !== 'mouse' && !(event.target as HTMLElement).closest('button')) pointerStart.current = { x: event.clientX, y: event.clientY }; }; const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => { const start = pointerStart.current; pointerStart.current = null; if (!start) return; const dx = event.clientX - start.x; const dy = event.clientY - start.y; if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.4) dx < 0 ? next() : previous(); };
  const reactionMeta: Array<{ id: RizzReaction; label: string; emoji: string; active: string }> = [
    { id: 'fire', label: 'Fire', emoji: '🔥', active: 'bg-rose-500 text-white shadow-md shadow-rose-500/30' },
    { id: 'cheesy', label: 'Cheesy', emoji: '🧀', active: 'bg-amber-500 text-white shadow-md shadow-amber-500/30' },
    { id: 'cringe', label: 'Cringe', emoji: '😬', active: 'bg-purple-500 text-white shadow-md shadow-purple-500/30' },
  ];
  const ratingWidth = Math.max(8, Math.min(100, (counts.fire / Math.max(1, total)) * 100));

  return <main className="w-full min-w-0 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#09090d] text-zinc-100 shadow-[0_24px_90px_rgba(0,0,0,0.35)]">
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-6">
        <RizzlineLogo />
        <button type="button" onClick={() => setSavedOpen(true)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 text-xs font-bold text-zinc-200 transition-colors hover:border-rose-500/50 hover:bg-rose-500/10" aria-label={`Open saved lines${savedIds.length ? `, ${savedIds.length} saved` : ''}`}>
          <span className="text-base text-rose-400" aria-hidden="true">♥</span><span>Saved</span>{savedIds.length > 0 && <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-200">{savedIds.length}</span>}
        </button>
      </header>

      <CategoryRail category={category} onChange={selectCategory} />

      <div className="min-w-0 px-4 pb-4 pt-3 sm:px-6">
        <div aria-live="polite" className="pointer-events-none min-h-5 text-center text-xs font-semibold text-rose-300">{notice}</div>
        <article onPointerDown={onPointerDown} onPointerUp={onPointerUp} className={`relative mt-1 min-w-0 touch-pan-y overflow-hidden rounded-[2rem] border border-white/[0.1] bg-gradient-to-b from-zinc-900/95 via-zinc-950 to-black p-5 shadow-2xl ${theme.glow} sm:p-7`}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/[0.07] to-transparent" />
          <div className="relative flex items-center justify-between gap-3">
            <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${theme.badge}`}><span aria-hidden="true">{categoryInfo.emoji} </span>{categoryInfo.label}</span>
            <button type="button" onClick={() => toggleSave(current)} className={`flex h-11 w-11 items-center justify-center rounded-full border text-xl transition-all hover:scale-105 ${saved.has(current.id) ? 'border-rose-400/60 bg-rose-500/15 text-rose-300' : 'border-white/[0.09] bg-white/[0.04] text-zinc-500 hover:border-rose-400/50 hover:text-rose-300'}`} aria-label={saved.has(current.id) ? 'Remove line from saved' : 'Save pickup line'} aria-pressed={saved.has(current.id)}>{saved.has(current.id) ? '♥' : '♡'}</button>
          </div>
          <button type="button" onClick={() => setCardLine(current)} className="relative mt-6 flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-left text-xs font-semibold text-zinc-400 transition-colors hover:border-rose-400/40 hover:text-rose-200"><span className="text-rose-300" aria-hidden="true">✦</span> Make this a shareable card <span className="ml-auto text-zinc-600" aria-hidden="true">→</span></button>
          <p className="relative px-1 pb-1 pt-7 text-center text-[1.65rem] font-semibold leading-[1.28] tracking-[-0.025em] text-zinc-100 sm:text-3xl">“{current.text}”</p>

          <div className="relative mt-7 border-t border-white/[0.08] pt-4">
            <button type="button" onClick={() => setTipOpen(value => !value)} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-1 text-left text-xs font-bold text-zinc-300 transition-colors hover:text-rose-200" aria-expanded={tipOpen}><span className="flex items-center gap-2"><span className="text-amber-300" aria-hidden="true">◉</span> Delivery Coach</span><span className="text-zinc-500">{tipOpen ? 'Hide' : 'Show'} <span aria-hidden="true">⌄</span></span></button>
            {tipOpen && <p className="mt-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.06] px-3.5 py-3 text-xs leading-5 text-amber-100/80">{current.deliveryTip || 'Keep it light, read the room, and let the other person respond.'}</p>}
          </div>

          <div className="relative mt-6 border-t border-white/[0.08] pt-5">
            <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Rizz Rating</span><span className="text-xs font-bold text-amber-300">{Math.round((counts.fire * 5 + counts.cheesy * 3 + counts.cringe) / Math.max(1, total) * 10) / 10}/5</span></div>
            <div className="mt-3 flex gap-2">
              {reactionMeta.map(item => <button key={item.id} type="button" onClick={() => react(item.id)} aria-pressed={reactions[current.id] === item.id} className={`${buttonBase} flex-1 ${reactions[current.id] === item.id ? item.active : 'border-white/[0.08] bg-white/[0.035] text-zinc-400 hover:border-white/20 hover:text-zinc-200'}`}><span aria-hidden="true">{item.emoji}</span><span className="ml-1.5">{item.label}</span><span className="ml-1 font-mono text-[10px] opacity-70">{counts[item.id]}</span></button>)}
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gradient-to-r from-purple-500 via-amber-400 to-rose-500"><div className="h-full bg-black/55" style={{ width: `${100 - ratingWidth}%`, marginLeft: `${ratingWidth}%` }} /></div>
          </div>

          <div className="relative mt-5 flex gap-2">
            <button type="button" onClick={() => void copy()} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-bold text-zinc-300 transition-colors hover:border-rose-400/40 hover:text-white"><span aria-hidden="true">▣</span> Copy Line</button>
            <button type="button" onClick={() => void share()} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-bold text-zinc-300 transition-colors hover:border-rose-400/40 hover:text-white"><span aria-hidden="true">↗</span> Share Line</button>
          </div>
        </article>
      </div>

      <nav aria-label="Pickup line controls" className="border-t border-white/[0.07] bg-black/20 px-4 pb-5 pt-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={previous} disabled={browse.index === 0} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-lg text-zinc-400 transition-colors hover:border-rose-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-35" aria-label="Previous pickup line">←</button>
          <button type="button" onClick={next} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 via-rose-600 to-amber-500 px-4 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition-all hover:brightness-110 active:scale-[0.98]"><span aria-hidden="true">✦</span> Generate Next</button>
          <button type="button" onClick={next} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-lg text-zinc-400 transition-colors hover:border-rose-400/40 hover:text-white" aria-label="Shuffle pickup line">⤨</button>
        </div>
        <div className="mx-auto mt-4 flex min-h-[50px] w-[320px] max-w-full items-center justify-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.035] text-center text-[10px] text-zinc-600"><span><span className="font-semibold text-zinc-500">Advertisement</span><br />Banner</span></div>
      </nav>
      <p className="px-4 pb-5 text-center text-[11px] text-zinc-600 sm:px-6">One line at a time. Keep it playful, personal, and easy to answer.</p>
    </div>

    {savedOpen && <SavedSheet lines={savedLines} onClose={() => setSavedOpen(false)} onRemove={id => setSavedIds(ids => ids.filter(savedId => savedId !== id))} onClear={() => setSavedIds([])} onSelect={line => { setCategory(line.category); setBrowse(state => appendLine(state, line)); }} />}
    {cardLine && <CardModal line={cardLine} onClose={() => setCardLine(null)} />}
  </main>;
}
