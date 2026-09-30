import { describe, expect, it } from 'vitest';
import { formatAge, formatCoords, formatTime, hourlyBuckets } from './format';

const NOW = Date.parse('2026-09-29T21:30:00Z'); // 15:30 in CDMX (UTC-6)

describe('formatTime', () => {
  it('renders CDMX local time regardless of the browser zone', () => {
    expect(formatTime('2026-09-29T21:30:05Z')).toBe('15:30:05');
  });
  it('shows a dash for missing values', () => {
    expect(formatTime(null)).toBe('—');
  });
});

describe('formatAge', () => {
  it.each([
    ['2026-09-29T21:29:58Z', 'ahora'],
    ['2026-09-29T21:29:15Z', 'hace 45 s'],
    ['2026-09-29T21:18:00Z', 'hace 12 min'],
    ['2026-09-29T18:30:00Z', 'hace 3 h'],
    ['2026-09-26T21:30:00Z', 'hace 3 d'],
  ])('%s → %s', (iso, expected) => {
    expect(formatAge(iso, NOW)).toBe(expected);
  });
});

describe('hourlyBuckets', () => {
  it('counts events per hour, oldest first, ignoring those outside the window', () => {
    const buckets = hourlyBuckets(
      [
        '2026-09-29T21:10:00Z', // current hour
        '2026-09-29T21:25:00Z', // current hour
        '2026-09-29T19:45:00Z', // two hours earlier
        '2026-09-28T10:00:00Z', // outside 12 h
      ],
      12,
      NOW,
    );
    expect(buckets).toHaveLength(12);
    expect(buckets.at(-1)).toBe(2);
    expect(buckets.at(-3)).toBe(1);
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('formatCoords', () => {
  it('uses 5 decimals (~1 m)', () => {
    expect(formatCoords(19.4187, -99.1597)).toBe('19.41870, -99.15970');
  });
});
