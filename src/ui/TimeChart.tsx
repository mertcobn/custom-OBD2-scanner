import { useEffect, useLayoutEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

export interface ChartSeries {
  label: string;
  /** y values aligned with `x` (null = gap) */
  values: (number | null)[];
  color?: string;
}

/**
 * Thin wrapper around uPlot (fast time-series canvas chart) styled with theme tokens.
 * `x` is epoch seconds.
 */
export function TimeChart({
  x,
  series,
  height = 220,
  unit,
  markers = [],
}: {
  x: number[];
  series: ChartSeries[];
  height?: number;
  unit?: string;
  markers?: number[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const markersRef = useRef(markers);
  const dataRef = useRef<uPlot.AlignedData>([x]);
  const shape = series.map((s) => s.label).join('|') + `|${unit}`;

  // Stream new data without rebuilding. Declared first so refs are fresh before (re)creation.
  useLayoutEffect(() => {
    markersRef.current = markers;
    dataRef.current = [x, ...series.map((s) => s.values)] as uPlot.AlignedData;
    plot.current?.setData(dataRef.current);
  }, [x, series, markers]);

  // (Re)create when the series shape or theme changes.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const build = () => {
    const ink = cssVar('--ink-muted');
    const line = cssVar('--line');
    const palette = [cssVar('--ai'), cssVar('--sakura-deep'), cssVar('--matcha'), cssVar('--kin'), cssVar('--beni')];
    const opts: uPlot.Options = {
      width: el.clientWidth || 300,
      height,
      padding: [8, 4, 0, 0],
      legend: { show: series.length > 1 },
      cursor: { drag: { x: true, y: false }, points: { size: 7 } },
      scales: { x: { time: true } },
      axes: [
        {
          stroke: ink,
          grid: { stroke: line, width: 1 },
          ticks: { stroke: line },
          font: '11px "JetBrains Mono Variable", monospace',
          // 24h clock, locale independent: HH:MM:SS
          values: (_u, splits) =>
            splits.map((s) => new Date(s * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
        },
        {
          stroke: ink,
          grid: { stroke: line, width: 1 },
          ticks: { show: false },
          size: 52,
          font: '11px "JetBrains Mono Variable", monospace',
          label: unit,
          labelFont: '11px "M PLUS 1p", sans-serif',
          labelSize: unit ? 16 : 0,
        },
      ],
      series: [
        {},
        ...series.map((s, i) => ({
          label: s.label,
          stroke: s.color ?? palette[i % palette.length],
          width: 1.8,
          spanGaps: true,
          points: { show: false },
        })),
      ],
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            ctx.save();
            ctx.strokeStyle = cssVar('--beni');
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1.5 * devicePixelRatio;
            for (const m of markersRef.current) {
              const px = u.valToPos(m, 'x', true);
              if (px < u.bbox.left || px > u.bbox.left + u.bbox.width) continue;
              ctx.beginPath();
              ctx.moveTo(px, u.bbox.top);
              ctx.lineTo(px, u.bbox.top + u.bbox.height);
              ctx.stroke();
            }
            ctx.restore();
          },
        ],
      },
    };
    plot.current?.destroy();
    plot.current = new uPlot(opts, dataRef.current, el);
    };
    build();
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    // Theme switched → rebuild so the canvas picks up the new colour tokens.
    const mo = new MutationObserver(build);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, height]);


  return <div ref={host} className="w-full [&_.u-legend]:text-xs [&_.u-legend]:text-ink-muted" />;
}
