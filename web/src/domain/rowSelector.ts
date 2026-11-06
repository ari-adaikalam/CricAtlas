// The rows and cards that play in one after another when their tile is on screen. This is the only list of them. `RowMarker` stamps `data-mrow` on each one inside a
// motion container, and every rule in the stylesheets and every check reads `[data-mrow]`, never a class name. A new kind of row either goes in this list or carries `data-mrow` in its own markup.

/** Table body rows (not the spacer a windowed list adds) and the classes of the card rows that are not tables. */
export const ROW_SELECTOR = 'tbody tr:not([data-spacer]), .bpr, .mr, .mc, .pti, .skc, .trr, .cr, .cc, .h2r, .tpr, [data-mrow]';
