import { describe, it, expect } from 'vitest';

import {
  pickChartColor,
  processChartData,
  shouldAngleLabels,
  toDataRows,
  toNumeric,
  toSeriesRows,
  yAxisWidth,
} from '@/lib/canvas/chart-data';

describe('toDataRows', () => {
  it('reads rows given directly or wrapped in { data }, and drops what is not a row', () => {
    expect(toDataRows([{ a: 1 }, 'x', null, [1]])).toEqual([{ a: 1 }]);
    expect(toDataRows({ data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(toDataRows({ a: 1 })).toEqual([]);
    expect(toDataRows(undefined)).toEqual([]);
  });
});

describe('toNumeric', () => {
  it('reads numbers written with units and separators', () => {
    expect(toNumeric(57)).toBe(57);
    expect(toNumeric('57%')).toBe(57);
    expect(toNumeric('$1,200.5')).toBe(1200.5);
  });

  it('treats anything unreadable as zero', () => {
    expect(toNumeric('n/a')).toBe(0);
    expect(toNumeric(Number.NaN)).toBe(0);
    expect(toNumeric(null)).toBe(0);
  });
});

describe('processChartData', () => {
  const rows = [
    { team: 'B', score: '10' },
    { team: 'A', score: 4 },
    { team: 'B', score: 20 },
  ];

  it('labels each row by its x value and keeps the order without an aggregate', () => {
    expect(processChartData(rows, 'team', 'score', null)).toEqual({
      items: [
        { team: 'B', score: 10, label: 'B' },
        { team: 'A', score: 4, label: 'A' },
        { team: 'B', score: 20, label: 'B' },
      ],
      valueKey: 'score',
    });
  });

  it('groups by x value, sorted, for sum and avg', () => {
    expect(processChartData(rows, 'team', 'score', 'sum').items).toEqual([
      { label: 'A', score: 4 },
      { label: 'B', score: 30 },
    ]);
    expect(processChartData(rows, 'team', 'score', 'avg').items).toEqual([
      { label: 'A', score: 4 },
      { label: 'B', score: 15 },
    ]);
  });

  it('stores a count under its own key', () => {
    expect(processChartData(rows, 'team', 'score', 'count')).toEqual({
      items: [
        { label: 'A', count: 1 },
        { label: 'B', count: 2 },
      ],
      valueKey: 'count',
    });
  });
});

describe('toSeriesRows', () => {
  it('keeps only the label and the series, as numbers', () => {
    expect(toSeriesRows([{ name: 'X', a: '1%', b: 2, other: 'y' }], 'name', ['a', 'b'])).toEqual([
      { label: 'X', a: 1, b: 2 },
    ]);
  });
});

describe('chart layout', () => {
  it('angles labels when there are many or long ones', () => {
    expect(shouldAngleLabels([{ label: 'a' }, { label: 'b' }])).toBe(false);
    expect(shouldAngleLabels(Array.from({ length: 6 }, (_, i) => ({ label: String(i) })))).toBe(true);
    expect(shouldAngleLabels([{ label: 'a label longer than fourteen' }])).toBe(true);
  });

  it('widens the y axis for large values', () => {
    expect(yAxisWidth([{ v: 5 }], 'v')).toBe(36);
    expect(yAxisWidth([{ v: 1234567 }], 'v')).toBe('1,234,567'.length * 7 + 8);
  });

  it('gives a seed the same color every time', () => {
    expect(pickChartColor('revenue')).toBe(pickChartColor('revenue'));
    expect(pickChartColor('')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
