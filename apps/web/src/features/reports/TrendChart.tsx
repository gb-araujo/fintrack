import { formatBRL } from '@fintrack/shared';
import { useId, useState } from 'react';

export interface TrendSeries {
  key: string;
  label: string;
  /** Cor fixa por série (identidade) — nunca reaproveitada por posição/rank. */
  color: string;
  values: number[];
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD_X = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

/**
 * Gráfico de linhas com até poucas séries e um eixo só (nunca dois eixos: quando as grandezas
 * diferem, o chamador normaliza ou usa gráficos separados). Sempre vem com uma tabela equivalente
 * (o chamador fornece `tableCaption`/linhas) para quem prefere ler os números exatos.
 */
export function TrendChart({ labels, series }: { labels: string[]; series: TrendSeries[] }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const allValues = series.flatMap((item) => item.values);
  const maxY = Math.max(0, ...allValues);
  const minY = Math.min(0, ...allValues);
  const range = maxY - minY || 1;
  const plotWidth = WIDTH - PAD_X * 2;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xAt = (index: number) =>
    labels.length > 1 ? PAD_X + (index / (labels.length - 1)) * plotWidth : PAD_X + plotWidth / 2;
  const yAt = (value: number) => PAD_TOP + plotHeight - ((value - minY) / range) * plotHeight;
  const zeroY = yAt(0);

  // Só alguns rótulos no eixo (evita sobreposição em séries longas); os valores exatos vão na tabela.
  const tickEvery = Math.max(1, Math.ceil(labels.length / 6));
  const tickIndexes = labels
    .map((_, index) => index)
    .filter((index) => index % tickEvery === 0 || index === labels.length - 1);

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
        {series.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              aria-hidden="true"
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Evolução de ${series.map((item) => item.label).join(' e ')} por período`}
        className="h-48 w-full"
        onMouseLeave={() => setHover(null)}
      >
        {minY < 0 && maxY > 0 ? (
          <line
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={zeroY}
            y2={zeroY}
            stroke="currentColor"
            className="text-slate-300"
            strokeDasharray="3 3"
          />
        ) : null}
        {series.map((item) => (
          <polyline
            key={item.key}
            points={item.values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(' ')}
            fill="none"
            stroke={item.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {labels.map((_, index) => (
          <rect
            key={index}
            x={xAt(index) - plotWidth / Math.max(labels.length, 1) / 2}
            y={0}
            width={plotWidth / Math.max(labels.length, 1)}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
        {series.map((item) =>
          item.values.map((value, index) => (
            <circle
              key={`${item.key}-${index}`}
              cx={xAt(index)}
              cy={yAt(value)}
              r={hover === index ? 4 : 2.5}
              fill={item.color}
            />
          )),
        )}
        {hover !== null ? (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            stroke="currentColor"
            className="text-slate-300"
          />
        ) : null}
        {tickIndexes.map((index) => (
          <text
            key={index}
            x={xAt(index)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-slate-500 text-[9px]"
          >
            {labels[index]}
          </text>
        ))}
        <text id={`${gradientId}-title`} className="sr-only" />
      </svg>
      {hover !== null ? (
        <dl
          role="status"
          aria-label={`Valores de ${labels[hover]}`}
          className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600"
        >
          <dt className="font-medium text-slate-800">{labels[hover]}</dt>
          {series.map((item) => (
            <div key={item.key} className="flex items-center gap-1">
              <dt>{item.label}:</dt>
              <dd className="tabular-nums">{formatBRL(item.values[hover] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
