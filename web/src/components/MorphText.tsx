'use client';

import { useLayoutEffect, useRef, useState, type ElementType } from 'react';

const DURATION = 450;

/**
 * A piece of text that morphs when it changes (the name, the description and the form of the profile when the player is changed): the new text fades in where the old one was, the old
 * text fades out above it at the size it had, and the box eases from its old width and height to its new ones, so what is around it moves with it instead of jumping. The old text is laid
 * over the box and takes no room, so the layout is always the new one. The new text is laid out at the width the box ends at while the box grows: laid out at the narrower width of the move, it
 * wrapped differently and its last words popped up onto the first line when the box got wide enough (a name, then a description). `nowrap` keeps a name on one line in any case. Reduced motion
 * changes it at once.
 */
export function MorphText({ text, as: Tag = 'span', className, nowrap = false, fixed = false }: { text: string; as?: ElementType; className?: string; nowrap?: boolean; /** The box is not eased to its new size (it sits in a row of fixed places, so nothing may slide): the words only cross-dissolve. */ fixed?: boolean }) {
  const box = useRef<HTMLElement>(null);
  // The text and the size the box had when it last rested, and whether it is moving now (a size read in the middle of the move is not a size it rests at).
  const rest = useRef({ text, width: 0, height: 0 });
  const moving = useRef(false);
  const [old, setOld] = useState<{ text: string; width: number; to: number } | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: this runs on the listed triggers only
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || moving.current) return;
    const { width, height } = el.getBoundingClientRect();
    const was = rest.current;
    rest.current = { text, width, height };
    if (was.text === text || was.width === 0 || typeof el.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    moving.current = true;
    setOld({ text: was.text, width: was.width, to: width });
    const done = (): void => { moving.current = false; setOld(null); };
    if (fixed) { window.setTimeout(done, DURATION); return; }
    const grow = el.animate([{ width: `${was.width}px`, height: `${was.height}px`, overflow: 'hidden' }, { width: `${width}px`, height: `${height}px`, overflow: 'hidden' }], { duration: DURATION, easing: 'cubic-bezier(0.22, 0.7, 0.25, 1)' });
    grow.onfinish = done; grow.oncancel = done;
  });
  return (
    <Tag ref={box} className={className} style={{ position: 'relative', whiteSpace: nowrap ? 'nowrap' : undefined }}>
      {/* While the box grows, the new text is laid out at the width it will end at, so it wraps as it will finally wrap and its words are uncovered, not moved. */}
      <span className="mt-new" key={text} style={old ? { display: 'inline-block', width: old.to } : undefined}>{text}</span>
      {old && <span className="mt-old" style={{ width: old.width }} aria-hidden="true">{old.text}</span>}
    </Tag>
  );
}
