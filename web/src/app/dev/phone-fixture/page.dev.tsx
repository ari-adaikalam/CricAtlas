'use client';

import { useEffect, useState } from 'react';

// Development only. A page with one planted fault of each kind the phone check looks for, and a clean one (?clean=1), so the check can be shown to see them (scripts/perf/phone-check-selftest.cjs).
export default function PhoneFixture() {
  const [clean, setClean] = useState(true);
  const [go, setGo] = useState(false);
  useEffect(() => {
    setClean(new URLSearchParams(window.location.search).get('clean') === '1');
    // The same animation started twice on one element: on, off, on.
    const t = [window.setTimeout(() => setGo(true), 800), window.setTimeout(() => setGo(false), 1600), window.setTimeout(() => setGo(true), 2400)];
    return () => t.forEach((x) => window.clearTimeout(x));
  }, []);
  const faults = !clean;
  return (
    <main style={{ padding: 8, color: '#fff', font: '14px system-ui', background: '#111', minHeight: '100vh' }}>
      <style>{'body > .site-nav, body > footer, .foot { display: none !important; } @keyframes fx { from { opacity: .6 } to { opacity: 1 } } .fxa.go { animation: fx .3s }'}</style>
      <section data-tile="full" style={{ height: 180, background: '#222', marginBottom: 8, padding: 8 }}>
        <p>A tile that is full.</p><p>Second line.</p><p>Third line.</p><p>Fourth line.</p><p>Fifth line.</p><p>Sixth line.</p><p>Seventh line.</p>
        <button type="button" style={{ minWidth: 120, minHeight: 48 }}>Big button</button>
      </section>
      {faults && (
        <>
          <section data-tile="empty" style={{ height: 300, background: '#222', marginBottom: 8, padding: 8 }}><p>Almost nothing in a big tile.</p></section>
          <section data-tile="tap" style={{ height: 80, background: '#222', marginBottom: 8, padding: 8 }}><button type="button" style={{ width: 20, height: 20 }}>x</button><p>One small button above.</p><p>More text.</p></section>
          <section data-tile="past" style={{ height: 80, background: '#222', marginBottom: 8, padding: 8, position: 'relative' }}><p>Text</p><div style={{ position: 'absolute', left: 8, top: 60, width: 100, height: 60, background: 'tomato' }}>past the panel</div><p>More text in the tile to fill it up a little.</p></section>
          <section data-tile="scrolls" style={{ height: 120, background: '#222', marginBottom: 8, padding: 8 }}><div style={{ height: 100, overflowY: 'auto' }}><p style={{ height: 400 }}>Scrolls and is not a table.</p></div></section>
          <section data-tile="clipped" style={{ height: 60, background: '#222', marginBottom: 8, padding: 8 }}><div style={{ width: 120, overflow: 'hidden', whiteSpace: 'nowrap' }}><span>This text is longer than the box that hides it</span></div></section>
          <section data-tile="wide" style={{ background: '#222', marginBottom: 8, padding: 8 }}><div style={{ width: 900, height: 30, background: 'teal' }}>wider than the window</div></section>
          <section data-tile="replay" style={{ height: 60, background: '#222', padding: 8 }}><span className={`fxa${go ? ' go' : ''}`}>animates twice</span></section>
        </>
      )}
    </main>
  );
}
