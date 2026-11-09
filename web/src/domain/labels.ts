import { FORMAT_NAME, type FormatChoice } from './filters';

export function formatLabel(format: FormatChoice): string {
  return FORMAT_NAME[format];
}
