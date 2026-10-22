// Data shaping for the Canvas charts and tables. The values come from a model's
// spec, so nothing here trusts their shape: rows may arrive wrapped in { data },
// and numbers as strings such as "57%" or "$1,200".

export type DataRow = Record<string, unknown>;

export type ChartAggregate = 'sum' | 'count' | 'avg';

function isDataRow(value: unknown): value is DataRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A bound { "$state": "/path" } can resolve to the rows or to an object holding them.
export function toDataRows(value: unknown): DataRow[] {
  const rows = isDataRow(value) ? value.data : value;
  return Array.isArray(rows) ? rows.filter(isDataRow) : [];
}

export function toNumeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/[%$,]/g, '').trim());
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

// Rows keyed by `label` (the x axis) with numeric values, grouped by xKey when an
// aggregate is asked for. A count is stored under "count".
export function processChartData(
  items: DataRow[],
  xKey: string,
  yKey: string,
  aggregate: ChartAggregate | null,
): { items: DataRow[]; valueKey: string } {
  if (!aggregate) {
    return {
      items: items.map((item) => ({ ...item, label: String(item[xKey] ?? ''), [yKey]: toNumeric(item[yKey]) })),
      valueKey: yKey,
    };
  }

  const groups = new Map<string, DataRow[]>();
  for (const item of items) {
    const groupKey = String(item[xKey] ?? 'unknown');
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), item]);
  }

  const valueKey = aggregate === 'count' ? 'count' : yKey;
  const aggregated = Array.from(groups.keys())
    .sort()
    .map((label) => {
      const group = groups.get(label) ?? [];
      const sum = group.reduce((total, item) => total + toNumeric(item[yKey]), 0);
      const value = aggregate === 'count' ? group.length : aggregate === 'sum' ? sum : sum / group.length;
      return { label, [valueKey]: value };
    });
  return { items: aggregated, valueKey };
}

// One row per x value with each series as a number, for a multi-series bar chart.
export function toSeriesRows(items: DataRow[], xKey: string, seriesKeys: string[]): DataRow[] {
  return items.map((item) => {
    const row: DataRow = { label: String(item[xKey] ?? '') };
    for (const key of seriesKeys) row[key] = toNumeric(item[key]);
    return row;
  });
}

// Many or long x labels are drawn at an angle so they don't overlap.
export function shouldAngleLabels(items: DataRow[]): boolean {
  if (items.length > 5) return true;
  const maxLen = items.reduce((max, item) => Math.max(max, String(item.label ?? '').length), 0);
  return maxLen > 14 || (items.length > 3 && maxLen > 10);
}

// Y axis width from the largest value's printed length, at about 7px per character.
export function yAxisWidth(items: DataRow[], valueKey: string): number {
  const maxVal = items.reduce((max, item) => Math.max(max, toNumeric(item[valueKey])), 0);
  const label = maxVal >= 1000 ? maxVal.toLocaleString('en-US') : String(Math.round(maxVal));
  return Math.max(36, label.length * 7 + 8);
}

// Bright enough to read in both themes. Colors chosen by the model are not used:
// models often pick ones that vanish on a dark background.
const CHART_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c', '#f472b6'];

// The same seed always gets the same color, so a chart keeps it across renders.
export function pickChartColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
}
