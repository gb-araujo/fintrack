import { PageHeader } from '../components/PageHeader';

export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Em construção — disponível na FASE {phase}.
      </div>
    </>
  );
}
