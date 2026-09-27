import { endOfMonth, startOfMonth } from '@fintrack/shared';
import { InputField, SelectField } from '../../components/ui/Fields';
import { useToday } from '../ledger/useToday';
import type { MonthsParams, PeriodParams } from '../../services/reports';

/** Datas vazias = período padrão do backend (mês corrente no fuso do usuário). */
export function PeriodControls({
  value,
  onChange,
}: {
  value: PeriodParams;
  onChange: (value: PeriodParams) => void;
}) {
  const today = useToday();
  const isDefault = !value.from && !value.to;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <InputField
        label="De"
        type="date"
        value={value.from ?? startOfMonth(today)}
        max={today}
        onChange={(event) => onChange({ ...value, from: event.target.value })}
      />
      <InputField
        label="Até"
        type="date"
        value={value.to ?? endOfMonth(today)}
        max={today}
        onChange={(event) => onChange({ ...value, to: event.target.value })}
      />
      {!isDefault ? (
        <button
          type="button"
          onClick={() => onChange({})}
          className="mb-[1px] h-fit text-sm font-medium text-brand-700 hover:underline"
        >
          Mês corrente
        </button>
      ) : null}
    </div>
  );
}

const MONTHS_OPTIONS = [
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
  { value: '24', label: 'Últimos 24 meses' },
];

export function MonthsControls({
  value,
  onChange,
}: {
  value: MonthsParams;
  onChange: (value: MonthsParams) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <SelectField
        label="Período"
        value={String(value.months ?? 12)}
        onChange={(event) => onChange({ ...value, months: Number(event.target.value) })}
        options={MONTHS_OPTIONS}
      />
    </div>
  );
}
