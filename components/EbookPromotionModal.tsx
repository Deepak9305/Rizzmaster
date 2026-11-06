import React, { useEffect, useRef } from 'react';
import { Heart, X } from 'lucide-react';
import './ebookPromotion.css';

interface Props { onClose: () => void; href: string }

export default function EbookPromotionModal({ onClose, href }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="ebook-promo" aria-labelledby="ebook-promo-title"
      aria-describedby="ebook-promo-description" onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <button type="button" className="ebook-promo-close" aria-label="Close ebook offer" onClick={onClose} autoFocus><X size={21} /></button>
      <img className="ebook-promo-cover" src="/promotions/make-her-think-about-you-cover.png"
        width="600" height="600" alt="Make Her Think About You Every Night by Amelia Smith ebook cover" />
      <div className="ebook-promo-content">
        <h2 id="ebook-promo-title">Make Her Think About You Every Night</h2>
        <div className="ebook-promo-divider" aria-hidden="true"><Heart size={19} /></div>
        <p id="ebook-promo-description">A private guide to words, timing, and tension that lingers.</p>
        <a className="ebook-promo-cta" href={href} target="_blank" rel="noopener noreferrer" onClick={onClose}>Get the PDF</a>
        <button type="button" className="ebook-promo-dismiss" onClick={onClose}>Not now</button>
      </div>
    </dialog>
  );
}
