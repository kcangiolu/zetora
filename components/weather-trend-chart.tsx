'use client';

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

interface TrendSeries {
  dataKey: string;
  color: string;
  strokeWidth: number;
  // Draws a filled area under the line.
  fillOpacity?: number;
}

interface TrendTooltipRow {
  color: string;
  label: string;
  value: string;
}

interface WeatherTrendChartProps<T extends { date: Date }> {
  data: T[];
  series: TrendSeries[];
  tooltipTitle: (point: T) => string;
  tooltipRows: (point: T) => TrendTooltipRow[];
}

// The weather card's charts: series over time on horizontal grid lines, with
// a tooltip that lists the hovered point's values.
export function WeatherTrendChart<T extends { date: Date }>({
  data,
  series,
  tooltipTitle,
  tooltipRows,
}: WeatherTrendChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip
          cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.4 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as T | undefined;
            if (!active || !point) return null;
            return (
              <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium mb-1">{tooltipTitle(point)}</div>
                <div className="grid gap-1">
                  {tooltipRows(point).map((row) => (
                    <div key={row.label} className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: row.color }} />
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="ml-auto pl-2 font-mono font-medium tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        />
        {series.map(({ dataKey, color, strokeWidth, fillOpacity }) =>
          fillOpacity === undefined ? (
            <Line
              key={dataKey}
              type="natural"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={strokeWidth}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }}
              animationDuration={800}
            />
          ) : (
            <Area
              key={dataKey}
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={strokeWidth}
              fill={color}
              fillOpacity={fillOpacity}
              activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }}
              animationDuration={800}
            />
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
