import { useId } from 'react';
import { BALL, WATERMARK } from './brandDrawings';

const prefix = (raw: string): string => `b${raw.replace(/[^a-zA-Z0-9]/g, '')}`;

/** The CricAtlas leather ball, drawn inline. */
export function BrandBall({ size, className }: { size: number; className?: string }) {
  const u = prefix(useId());
  return <svg className={className} viewBox={BALL.viewBox} width={size} height={size} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: BALL.inner.replaceAll('@@', u) }} />;
}

/** The large faint ball behind a page's header, drawn inline. Its size comes from the page's CSS (`.wm`). */
export function Watermark({ className = 'wm' }: { className?: string }) {
  const u = prefix(useId());
  return <svg className={className} viewBox={WATERMARK.viewBox} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: WATERMARK.inner.replaceAll('@@', u) }} />;
}
