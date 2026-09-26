import { useApiHealth } from '../../hooks/useApiHealth';

export function ApiStatusCard() {
  const { data, isPending, isError, refetch, isFetching } = useApiHealth();

  let label: string;
  let tone: string;
  if (isPending) {
    label = 'Verificando API…';
    tone = 'bg-slate-300';
  } else if (isError) {
    label = 'API indisponível';
    tone = 'bg-rose-500';
  } else if (data.status === 'ok') {
    label = 'API online';
    tone = 'bg-emerald-500';
  } else {
    label = 'API com problemas';
    tone = 'bg-amber-500';
  }

  return (
    <section
      aria-labelledby="api-status-title"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="api-status-title" className="text-sm font-medium text-slate-500">
            Status do sistema
          </h2>
          <p className="mt-1 flex items-center gap-2 text-base font-semibold" role="status">
            <span className={`size-2.5 rounded-full ${tone}`} aria-hidden="true" />
            {label}
          </p>
          {data ? (
            <p className="mt-1 text-xs text-slate-500">
              Banco de dados: {data.checks.database === 'ok' ? 'conectado' : 'indisponível'} ·
              versão {data.version}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Verificar
        </button>
      </div>
    </section>
  );
}
