/**
 * Starts the fetch of the page's data file as soon as the page's HTML is parsed, from the address alone, the way the server page used to (`preload` in each route). A player, match, team or
 * tournament page is one prebuilt shell for every address (src/proxy.ts), so the server no longer knows which one it is. The rules for the id are the ones in domain/slug.ts. The link is
 * `rel=preload as=fetch crossorigin`, which the page's own `fetch` of the same file picks up, so the file is asked for once.
 */
export function earlyFetchScript(base: string | undefined): string {
  if (!base) return '';
  const b = JSON.stringify(base.replace(/\/$/, ''));
  return `(function(){try{var b=${b},p=location.pathname.split('/'),k=p[1],s=decodeURIComponent(p[2]||''),u=null,m;
if(p.length!==3||!s||s==='_'||s==='_shell')return;
if(k==='players'){m=/^(?:.*-)?([0-9a-f]{8})$/.exec(s);if(m)u=b+'/p/profile/'+m[1]+'.json'}
else if(k==='matches'){m=/(?:^|-)(\\d{1,9})$/.exec(s);if(m)u=b+'/m/bundle/'+m[1]+'.json'}
else if(k==='teams'){if(/^[a-z0-9-]+~[a-z0-9-]+~(male|female)$/.test(s))u=b+'/t/b/'+s+'.json'}
else if(k==='tournaments'){if(/^[a-z0-9-]+$/.test(s))u=b+'/n/b/'+s+'.json'}
if(!u)return;var l=document.createElement('link');l.rel='preload';l.as='fetch';l.href=u;l.crossOrigin='anonymous';document.head.appendChild(l)}catch(e){}})();`;
}
