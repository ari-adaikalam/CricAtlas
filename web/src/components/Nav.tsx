import { PrefetchLink } from './PrefetchLink';
import { BrandBall } from './BrandArt';
import { NavMenuItem } from './NavMenuItem';
import { SearchBox } from './SearchBox';
import { NavBurger } from './NavBurger';
import type { MenuKey } from '@/data/navMenu';

interface Item { href: string; label: string; built: boolean; menu?: MenuKey }

// The top bar is the same on every page: Home, the four root pages, API, and the Compare button at the right
//A page that is not built yet looks like the others but cannot be followed, so no link leads to a 404.
const ITEMS: readonly Item[] = [
  { href: '/', label: 'Home', built: true },
  { href: '/players', label: 'Players', built: true, menu: 'players' },
  { href: '/teams', label: 'Teams', built: true, menu: 'teams' },
  { href: '/matches', label: 'Matches', built: true, menu: 'matches' },
  { href: '/tournaments', label: 'Tournaments', built: true, menu: 'tournaments' },
  { href: '/series', label: 'Series', built: true, menu: 'series' },
  { href: '/records', label: 'Records', built: true, menu: 'records' },
  { href: '/api', label: 'API', built: true, menu: 'api' },
];

/** The markup of the mockup's bar. The player page draws it inside its own app frame so it can slide away in the analysis state. */
export function NavBar() {
  return (
    <div className="nav">
      <PrefetchLink href="/" className="brand">
        <BrandBall size={30} />
        <div>Cric<span>Atlas</span></div>
      </PrefetchLink>
      <NavBurger />
      {/* One box for the links, search and Compare: it takes no room of its own at desktop widths (display: contents) and is the menu panel on a phone. */}
      <div className="nav-panel">
        {ITEMS.map((item) => item.built
          ? (item.menu ? <NavMenuItem key={item.href} href={item.href} label={item.label} menu={item.menu} /> : <PrefetchLink key={item.href} href={item.href}>{item.label}</PrefetchLink>)
          : <a key={item.href} aria-disabled="true" title="Not built yet">{item.label}</a>)}
        <span className="sp" />
        <SearchBox />
        <PrefetchLink className="cmp" href="/compare">Compare</PrefetchLink>
      </div>
    </div>
  );
}

/** The brand in the top strip of a page with its own frame (the bar with the menu has slid away), a link home. */
export function StripBrand() {
  return (
    <PrefetchLink href="/" className="brand sbrand" aria-label="CricAtlas home">
      <BrandBall size={26} />
      <div>Cric<span>Atlas</span></div>
    </PrefetchLink>
  );
}

export function Nav() {
  return <nav aria-label="Main" className="site-nav"><NavBar /></nav>;
}
