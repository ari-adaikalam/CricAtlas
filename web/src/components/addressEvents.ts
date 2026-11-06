export const ADDRESS_EVENT = 'cricatlas:address';

/**
 * Runs `onChange` when the address changes by Back or Forward, or by a link to another address of the same section (the top bar's menus, a link in a list). The second is a router
 * navigation, which the browser does not announce as a popstate, so the shared page announces it (useAddressShell.tsx). Returns the function that stops listening. This file imports
 * nothing, so a view can use it without taking the shell's style sheet with it.
 */
export function listenAddress(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(ADDRESS_EVENT, onChange);
  return () => { window.removeEventListener('popstate', onChange); window.removeEventListener(ADDRESS_EVENT, onChange); };
}
