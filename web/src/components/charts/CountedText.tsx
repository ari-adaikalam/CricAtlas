'use client';

import { CountText } from './CountUp';

/** Text such as "7,949 runs, avg 43.2" whose numbers count up from zero when they change. Commas and decimals are kept as written, and the width is that of the final text. */
export function CountedText({ text, play = true, morph = false }: { text: string; play?: boolean; /** A change of the text counts on from the number shown, not from zero (a profile changed to another player). */ morph?: boolean }) {
  return (
    <>
      {text.split(/(\d[\d,]*(?:\.\d+)?)/).map((part, i) => {
        if (i % 2 === 0) return part;
        const decimals = part.split('.')[1]?.length ?? 0;
        const format = (n: number): string => n.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        return <CountText key={i} value={Number(part.replace(/,/g, ''))} format={format} play={play} morph={morph} />;
      })}
    </>
  );
}
