import { notFound } from 'next/navigation';
import { TileLoader } from '@/components/states/TileStates';
import '@/styles/player.css';

// Development only: the loading ball inside each kind of tile body, in the real tile frames. Production returns 404.
export default function TileLoadingPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const frame = (title: string, body: React.ReactNode, wide = false) => (
    <article className={`tile${wide ? ' wide' : ''}`}>
      <h4><span className="ttl">{title}</span></h4>
      {body}
    </article>
  );
  return (
    <div className="pgx" style={{ height: 'calc(100dvh - 60px)' }}>
      <div className="app state-ana view-bat" data-up="2" style={{ height: '100%' }}>
        <section className="pane" id="p-bat" style={{ top: 0 }}>
          <div className="stagewrap">
            <div className="car">
              {frame('Body of the tile (Key numbers, Phases)', <TileLoader label="Key numbers" />)}
              {frame('Inside .art (Form, Wagon wheel)', <div className="art"><TileLoader label="Wagon wheel" /></div>)}
              {frame('Wide tile (Pitch map)', <div className="art"><TileLoader label="Pitch map" /></div>, true)}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
