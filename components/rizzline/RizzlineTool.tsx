import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, Copy, Download, Heart, Layers, Lightbulb, LoaderCircle, Share2, Shuffle, Sparkles, Trash2, X } from 'lucide-react';
import { CATEGORIES, CATALOG_BY_ID, CURATED_PICKUP_LINES, LINES_BY_CATEGORY } from './data/curatedLines';
import { getRandomPickupLine } from './services/pickupLineApi';
import { appendLine, createBrowseState, previousLine } from './utils/browseHistory';
import { copyLine, shareLine } from './browserActions';
import { CARD_THEMES, createLineCard, downloadCardBlob, shareCardBlob } from './cardActions';
import { useLocalCollection } from './useLocalCollection';
import type { CategoryKey, PickupLine, RizzReaction } from './types';
import './rizzline.css';

const REACTIONS: Array<{ id: RizzReaction; label: string; emoji: string }> = [
  { id: 'fire', label: 'Fire', emoji: '🔥' },
  { id: 'cheesy', label: 'Cheesy', emoji: '🧀' },
  { id: 'cringe', label: 'Cringe', emoji: '😬' },
];

function readReactions(): Record<string, RizzReaction> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('rizzmaster_rizzline_reactions_v1') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, reaction]) => CATALOG_BY_ID.has(id) && ['fire', 'cheesy', 'cringe'].includes(String(reaction)))) as Record<string, RizzReaction>;
  } catch { return {}; }
}

function Dialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`rl-dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="rl-dialog-body">{children}</div>
  </dialog>;
}

function CardModal({ line, onClose }: { line: PickupLine; onClose: () => void }) {
  const [theme, setTheme] = useState('rose');
  const [name, setName] = useState('');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const processing = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    setImage(null); setError(''); setNotice('');
    void createLineCard(line.text, line.category, theme, name).then(blob => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setImage({ blob, url });
    }).catch(() => { if (!cancelled) setError('The card could not be prepared. Please try again.'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [line.text, line.category, theme, name, retry]);
  const share = async () => {
    if (!image || processing.current) return;
    processing.current = true; setBusy(true);
    try {
      const result = await shareCardBlob(image.blob);
      if (result !== 'cancelled') setNotice(result === 'shared' ? 'Card shared!' : 'PNG saved. You can attach it to your message.');
    } catch { setNotice('Sharing is unavailable. Try Save PNG instead.'); }
    finally { processing.current = false; setBusy(false); }
  };
  const copy = async () => {
    try { await copyLine(`“${line.text}”${name.trim() ? `\n— ${name.trim()}` : ''}`); setNotice('Text copied!'); }
    catch { setNotice('Could not copy. Please try again.'); }
  };
  return <Dialog title="Love Note Card" onClose={onClose} className="rl-card-dialog">
    <header className="rl-modal-heading"><div><h2><Layers size={19} /> Love Note Card</h2><p>A little rizz, ready for stories & DMs.</p></div><button className="rl-icon-button" onClick={onClose} aria-label="Close love note card preview"><X size={20} /></button></header>
    <div className="rl-themes" aria-label="Card theme">{CARD_THEMES.map(item => <button key={item.id} type="button" aria-pressed={theme === item.id} onClick={() => setTheme(item.id)} style={{ '--rl-theme': item.accent } as React.CSSProperties}><span />{item.name}</button>)}</div>
    <label className="rl-name"><span>Your name <small>Optional</small></span><input value={name} maxLength={32} onChange={event => setName(event.target.value)} placeholder="e.g. Alex" autoComplete="off" /></label>
    <div className="rl-preview" aria-busy={!image && !error}>{image ? <img src={image.url} alt={`Share card: ${line.text}${name.trim() ? ` — ${name.trim()}` : ''}`} width={1080} height={1350} /> : <div role="status">{error ? <><p>{error}</p><button className="rl-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></> : <><LoaderCircle className="rl-spin" size={24} /><p>Preparing your card…</p></>}</div>}</div>
    <div className="rl-card-buttons"><button className="rl-primary" disabled={!image || busy} onClick={() => void share()}>{busy ? <LoaderCircle className="rl-spin" size={17} /> : <Share2 size={17} />} Share Card</button><button className="rl-secondary" disabled={!image || busy} onClick={() => { if (image) { downloadCardBlob(image.blob); setNotice('PNG saved!'); } }}><Download size={17} /> Save PNG</button></div>
    <button className="rl-text-button" onClick={() => void copy()}><Copy size={15} /> Copy Text</button>
    <p className="rl-modal-notice" role="status">{notice || 'Image sharing depends on your browser. Save PNG works too.'}</p>
  </Dialog>;
}

function SavedSheet({ lines, onClose, onRemove, onClear, onSelect }: { lines: PickupLine[]; onClose: () => void; onRemove: (id: string) => void; onClear: () => void; onSelect: (line: PickupLine) => void }) {
  return <Dialog title="Saved lines" onClose={onClose}>
    <header className="rl-modal-heading"><div><h2><Bookmark size={18} /> Saved lines <span className="rl-count">{lines.length}</span></h2><p>Your favorites, kept on this browser.</p></div><button className="rl-icon-button" onClick={onClose} aria-label="Close saved lines"><X size={20} /></button></header>
    {lines.length ? <><div className="rl-saved-list">{lines.map(line => <article key={line.id}><p>{line.text}</p><div><span className="rl-tag">{line.category}</span><button className="rl-text-button" onClick={() => { onSelect(line); onClose(); }}><ArrowRight size={16} /> Use line</button><button className="rl-icon-button" onClick={() => onRemove(line.id)} aria-label="Remove saved line"><Trash2 size={17} /></button></div></article>)}</div><button className="rl-text-button" onClick={() => { if (window.confirm('Remove all saved lines?')) onClear(); }}><Trash2 size={16} /> Clear saved lines</button></> : <div className="rl-empty"><Heart size={35} /><h3>No saved lines yet</h3><p>Tap the heart on a line to keep it here.</p></div>}
  </Dialog>;
}

export default function RizzlineTool() {
  const [category, setCategory] = useState<CategoryKey>('all');
  const [browse, setBrowse] = useState(() => createBrowseState(getRandomPickupLine('all').line));
  const [savedOpen, setSavedOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [cardLine, setCardLine] = useState<PickupLine | null>(null);
  const [notice, setNotice] = useState('');
  const [reactions, setReactions] = useState<Record<string, RizzReaction>>(readReactions);
  const { savedIds, setSavedIds, storageAvailable } = useLocalCollection();
  const current = browse.lines[browse.index];
  const saved = savedIds.includes(current.id);
  const savedLines = useMemo(() => savedIds.flatMap(id => { const line = CATALOG_BY_ID.get(id); return line ? [line] : []; }), [savedIds]);
  const categoryInfo = CATEGORIES.find(item => item.id === current.category) || CATEGORIES[0];
  const railRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const next = () => { setTipOpen(false); setNotice(''); setBrowse(state => appendLine(state, getRandomPickupLine(category, state.lines[state.index].text).line)); };
  const previous = () => { setTipOpen(false); setNotice(''); setBrowse(state => previousLine(state)); };
  const selectCategory = (value: CategoryKey) => {
    if (value === category) return;
    setCategory(value); setTipOpen(false); setNotice('');
    setBrowse(state => appendLine(state, getRandomPickupLine(value, state.lines[state.index].text).line));
  };
  useEffect(() => { try { localStorage.setItem('rizzmaster_rizzline_reactions_v1', JSON.stringify(reactions)); } catch { /* Rating still works for this visit. */ } }, [reactions]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2500); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (rail && active) rail.scrollTo({ left: active.offsetLeft - rail.offsetLeft - (rail.clientWidth - active.clientWidth) / 2, behavior: 'smooth' });
  }, [category]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (savedOpen || cardLine || event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest('button,a,input,textarea,select,[contenteditable]'))) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [category, savedOpen, cardLine]);
  const copy = async () => { try { await copyLine(current.text); setNotice('Copied!'); } catch { setNotice('Could not copy this line.'); } };
  const share = async () => { try { const result = await shareLine(`“${current.text}”\n\nvia Rizzline · rizzmaster.online/rizzline`); if (result !== 'cancelled') setNotice(result === 'shared' ? 'Shared!' : 'Copied for sharing!'); } catch { setNotice('Could not share. Try Copy Line instead.'); } };
  const onPointerDown = (event: React.PointerEvent) => { if (event.pointerType !== 'mouse' && !(event.target as Element).closest('button')) pointerStart.current = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event: React.PointerEvent) => { const start = pointerStart.current; pointerStart.current = null; if (!start) return; const dx = event.clientX - start.x; const dy = event.clientY - start.y; if (Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 1.4) dx < 0 ? next() : previous(); };
  return <section className="rl-tool" aria-label="Rizzline pickup line generator">
    <header className="rl-header"><div className="rl-brand"><img src="/rizzline-logo.png" alt="" width={40} height={40} /><div><span>Rizzline</span><small>Good lines. Better conversations.</small></div></div><button className="rl-secondary rl-saved-button" onClick={() => setSavedOpen(true)} aria-label={`Open saved lines, ${savedIds.length} saved`}><Bookmark size={17} /><span>Saved</span>{savedIds.length > 0 && <span className="rl-count">{savedIds.length}</span>}</button></header>
    <div className="rl-vibes"><div className="rl-section-label"><span>Find your vibe</span><span>{CURATED_PICKUP_LINES.length.toLocaleString()} lines · 8 vibes</span></div><div ref={railRef} className="rl-vibe-rail" aria-label="Pickup line vibes">{CATEGORIES.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => selectCategory(item.id)}><span aria-hidden="true">{item.emoji}</span>{item.label}</button>)}</div></div>
    <article className="rl-line-card" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { pointerStart.current = null; }}>
      <div className="rl-card-top"><span className="rl-tag"><span aria-hidden="true">{categoryInfo.emoji}</span> {categoryInfo.label}</span><div><button className="rl-icon-button" onClick={() => setCardLine(current)} title="Create a shareable card" aria-label="Create a shareable story card"><Layers size={20} /></button><button className={`rl-icon-button ${saved ? 'rl-is-saved' : ''}`} aria-label={saved ? 'Remove line from saved' : 'Save pickup line'} aria-pressed={saved} onClick={() => setSavedIds(ids => ids.includes(current.id) ? ids.filter(id => id !== current.id) : [current.id, ...ids].slice(0, 500))}><Heart size={20} fill={saved ? 'currentColor' : 'none'} /></button></div></div>
      <div className="rl-quote-stage"><span className="rl-quote-mark" aria-hidden="true">“</span><p className="rl-quote" key={browse.visit} aria-live="polite" aria-atomic="true">{current.text}</p></div>
      <div className="rl-coach"><button className="rl-text-button" aria-expanded={tipOpen} onClick={() => setTipOpen(value => !value)}><Lightbulb size={16} /> Delivery Coach <ChevronDown size={15} className={tipOpen ? 'rl-rotated' : ''} /></button>{tipOpen && <p>{current.deliveryTip || 'Keep it light, read the room, and leave space for a response.'}</p>}</div>
      <div className="rl-rating"><div className="rl-section-label"><span>Rizz Rating</span><span>Your take</span></div><div className="rl-reactions">{REACTIONS.map(item => <button key={item.id} type="button" aria-pressed={reactions[current.id] === item.id} onClick={() => setReactions(state => { const nextState = { ...state }; if (nextState[current.id] === item.id) delete nextState[current.id]; else nextState[current.id] = item.id; return nextState; })}><span aria-hidden="true">{item.emoji}</span>{item.label}{reactions[current.id] === item.id && <Check size={13} />}</button>)}</div></div>
      <div className="rl-utilities"><button className="rl-secondary" onClick={() => void copy()}>{notice === 'Copied!' ? <Check size={16} /> : <Copy size={16} />} {notice === 'Copied!' ? 'Copied!' : 'Copy Line'}</button><button className="rl-secondary" onClick={() => void share()}><Share2 size={16} /> Share Line</button></div>
    </article>
    <div className="rl-navigation"><button className="rl-secondary rl-back" disabled={browse.index === 0} onClick={previous} aria-label="Previous pickup line"><ArrowLeft size={20} /></button><button className="rl-primary" onClick={next}><Sparkles size={18} /> Generate Next <ArrowRight size={18} /></button><button className="rl-secondary rl-back" onClick={next} aria-label="Shuffle pickup line"><Shuffle size={19} /></button></div>
    <button className="rl-card-cta" onClick={() => setCardLine(current)}><Layers size={18} /><span>Turn this line into a share card</span><ArrowRight size={17} /></button>
    <p className="rl-tool-status" role="status">{notice || (!storageAvailable ? 'Saving is available for this visit only.' : `${LINES_BY_CATEGORY[category].length.toLocaleString()} ${category === 'all' ? '' : category + ' '}lines. One at a time.`)}</p>
    {savedOpen && <SavedSheet lines={savedLines} onClose={() => setSavedOpen(false)} onRemove={id => setSavedIds(ids => ids.filter(value => value !== id))} onClear={() => setSavedIds([])} onSelect={line => { setCategory(line.category); setTipOpen(false); setBrowse(state => appendLine(state, line)); }} />}
    {cardLine && <CardModal line={cardLine} onClose={() => setCardLine(null)} />}
  </section>;
}
