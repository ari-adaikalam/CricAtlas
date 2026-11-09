import { describe, expect, it } from 'vitest';
import { capabilityOf } from '../device';

describe('device capability', () => {
  it('is light with 4 GB of memory or less, full above', () => {
    expect(capabilityOf({ memoryGb: 4, width: 1440 })).toBe('light');
    expect(capabilityOf({ memoryGb: 2, width: 1440 })).toBe('light');
    expect(capabilityOf({ memoryGb: 8, width: 390 })).toBe('full');
  });
  it('is light on data saver or a slow connection, whatever the memory', () => {
    expect(capabilityOf({ memoryGb: 8, saveData: true, width: 1440 })).toBe('light');
    for (const connection of ['slow-2g', '2g', '3g']) expect(capabilityOf({ memoryGb: 8, connection, width: 1440 })).toBe('light');
    expect(capabilityOf({ memoryGb: 8, connection: '4g', width: 1440 })).toBe('full');
  });
  it('guesses from the screen when nothing is reported (Safari)', () => {
    expect(capabilityOf({ width: 1440 })).toBe('full');
    expect(capabilityOf({ width: 390 })).toBe('light');
    expect(capabilityOf({ width: 820 })).toBe('light');
  });
});
