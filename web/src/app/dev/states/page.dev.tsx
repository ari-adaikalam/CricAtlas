import { notFound } from 'next/navigation';
import { StatePanel, stateStyles } from '@/components/states/StatePanel';

// Development only: every state side by side, for checking the artwork and the words. Production returns 404.
export default function StatesPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="page">
      <div className="tiles">
        <section className="tile"><StatePanel kind="loading" size="tile" title="Setting the field" text="Loading the data. The first load takes a second or two." /></section>
        <section className="tile"><StatePanel kind="notfound" size="tile" title="That one went wide" text="We could not find that page. Check the address."><span className={stateStyles.btn}>Go Home</span></StatePanel></section>
        <section className="tile"><StatePanel kind="error" size="tile" title="Clean bowled" text="Something went wrong on our side. Try again."><span className={stateStyles.btn}>Try again</span></StatePanel></section>
        <section className="tile"><StatePanel kind="empty" size="tile" title="No balls in this slice" text="Nothing matches these filters. Clear a filter to get the ball rolling."><span className={stateStyles.btn}>Clear filters</span></StatePanel></section>
      </div>
    </main>
  );
}
