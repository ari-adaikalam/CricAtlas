'use client';

// Last resort when the root layout itself fails. It cannot use the layout, fonts or global styles, so it carries its own.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#141414', color: '#fff', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <div role="alert">
          <h1 style={{ fontSize: 30, fontWeight: 600 }}>Clean bowled</h1>
          <p style={{ color: '#a8a8a8', maxWidth: 420 }}>Something went wrong on our side. Try again.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, background: '#c4313a', color: '#fff', border: 0, borderRadius: 6, padding: '10px 20px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
