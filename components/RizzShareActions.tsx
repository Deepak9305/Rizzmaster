import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Layers, LoaderCircle, Share2, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { copyRizz, shareRizz, saveRizzCard, shareRizzCard } from '../services/rizzSharing';
import { CARD_THEMES, createLineCard } from './rizzline/cardActions';
import './webRizzShare.css';

const CARD_BRANDING = { brand: 'Rizz Master', url: 'rizzmaster.online' };

function RizzShareCardModal({ content, label, onClose, onCardOpenChange }: { content: string; label: string; onClose: () => void; onCardOpenChange?: (open: boolean) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const processing = useRef(false);
  const [theme, setTheme] = useState('rose');
  const [name, setName] = useState('');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    onCardOpenChange?.(true);
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      onCardOpenChange?.(false);
    };
  }, [onCardOpenChange]);

  useEffect(() => {
    const close = () => { if (!processing.current) onClose(); };
    window.addEventListener('rizzmaster:close-share-card', close);
    return () => window.removeEventListener('rizzmaster:close-share-card', close);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    setImage(null); setError(''); setNotice('');
    void createLineCard(content, label, theme, name, CARD_BRANDING).then(blob => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setImage({ blob, url });
    }).catch(() => {
      if (!cancelled) setError('Your card could not be prepared. Please try again.');
    });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [content, label, theme, name, retry]);

  const share = async () => {
    if (!image || processing.current) return;
    processing.current = true; setBusy(true); setNotice('');
    try {
      const result = await shareRizzCard(image.blob);
      if (result !== 'cancelled') setNotice(result === 'shared' ? 'Share opened.' : 'PNG saved. Attach it to your message or story.');
    } catch { setNotice('Could not share this card. Use Save PNG instead.'); }
    finally { processing.current = false; setBusy(false); }
  };

  const save = async () => {
    if (!image || processing.current) return;
    processing.current = true; setBusy(true); setNotice('');
    try { if (await saveRizzCard(image.blob) === 'saved') setNotice('PNG saved!'); }
    catch { setNotice('Could not save this card. Please try again.'); }
    finally { processing.current = false; setBusy(false); }
  };

  const copy = async () => {
    try { await copyRizz(content); setNotice('Rizz copied!'); }
    catch { setNotice('Could not copy this rizz. Please try again.'); }
  };

  return createPortal(
    <dialog ref={dialogRef} className="rm-share-dialog" aria-labelledby="rm-share-title" onCancel={event => { event.preventDefault(); if (!processing.current) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !processing.current) onClose(); }}>
      <div className="rm-share-body">
        <header className="rm-share-heading">
          <div><h2 id="rm-share-title"><Layers size={19} /> Share Rizz Card</h2><p>Your {label.toLowerCase()} reply, ready for stories & DMs.</p></div>
          <button type="button" className="rm-share-icon" onClick={onClose} disabled={busy} aria-label="Close rizz card preview" autoFocus><X size={20} /></button>
        </header>
        <div className="rm-share-themes" role="group" aria-label="Card theme">
          {CARD_THEMES.map(item => <button key={item.id} type="button" disabled={busy} aria-pressed={theme === item.id} onClick={() => setTheme(item.id)} style={{ '--rm-theme': item.accent } as React.CSSProperties}><span aria-hidden="true" />{item.name}</button>)}
        </div>
        <label className="rm-share-name"><span>Your name <small>Optional</small></span><input value={name} maxLength={32} disabled={busy} onChange={event => setName(event.target.value)} placeholder="e.g. Alex" autoComplete="off" /></label>
        <div className="rm-share-preview" aria-busy={!image && !error}>
          {image ? <img src={image.url} alt={`${label} rizz card: ${content}`} /> : <div role="status">{error ? <><p>{error}</p><button type="button" className="rm-share-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></> : <><LoaderCircle className="rm-share-spin" size={24} /><p>Preparing your card…</p></>}</div>}
        </div>
        <div className="rm-share-buttons">
          <button type="button" className="rm-share-primary" disabled={!image || busy} onClick={() => void share()}>{busy ? <LoaderCircle className="rm-share-spin" size={17} /> : <Share2 size={17} />} Share Card</button>
          <button type="button" className="rm-share-secondary" disabled={!image || busy} onClick={() => void save()}><Download size={17} /> Save PNG</button>
        </div>
        <button type="button" className="rm-share-copy" disabled={busy} onClick={() => void copy()}><Copy size={15} /> Copy Text</button>
        <p className="rm-share-notice" role="status">{notice || 'Share it directly, or save the PNG to send anywhere.'}</p>
      </div>
    </dialog>, document.body
  );
}

export default function RizzShareActions({ content, label, onCardOpenChange }: { content: string; label: string; onCardOpenChange?: (open: boolean) => void }) {
  const [cardOpen, setCardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const processing = useRef(false);
  const { showToast } = useToast();
  const share = async () => {
    if (processing.current) return;
    processing.current = true; setBusy(true);
    try {
      const result = await shareRizz(content);
      if (result !== 'cancelled') showToast(result === 'shared' ? 'Share opened.' : 'Rizz copied! Paste it anywhere.', 'success');
    } catch { showToast('Could not share or copy this rizz. Please try again.', 'error'); }
    finally { processing.current = false; setBusy(false); }
  };
  return <>
    <button type="button" onClick={() => void share()} disabled={busy} className="rm-rizz-action" title="Share Rizz" aria-label={`Share ${label.toLowerCase()} rizz`}>
      {busy ? <LoaderCircle size={16} className="rm-share-spin" /> : <Share2 size={16} />}
    </button>
    <button type="button" onClick={() => setCardOpen(true)} className="rm-rizz-action" title="Share Rizz Card" aria-label={`Create ${label.toLowerCase()} rizz share card`}><Layers size={16} /></button>
    {cardOpen && <RizzShareCardModal content={content} label={label} onClose={() => setCardOpen(false)} onCardOpenChange={onCardOpenChange} />}
  </>;
}
