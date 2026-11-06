/** Stands for the rows of a long table that are not drawn (useWindowedRows), a row of the table's own width and the height of the rows it replaces. */
export function WindowSpacer({ height, columns }: { height: number; columns: number }) {
  return height > 0 ? <tr data-spacer="" aria-hidden="true"><td colSpan={columns} style={{ height, padding: 0, border: 0 }} /></tr> : null;
}
