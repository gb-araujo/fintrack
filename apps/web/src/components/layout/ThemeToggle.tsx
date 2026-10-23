import { useTheme } from '../../lib/theme-context';
import { Icon } from '../icons';

/** Alterna entre tema claro e escuro. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className={
        compact
          ? 'shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-50'
          : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-50'
      }
    >
      <Icon name={isDark ? 'sun' : 'moon'} className={compact ? 'size-5' : 'size-5 shrink-0'} />
      {compact ? null : isDark ? 'Tema claro' : 'Tema escuro'}
    </button>
  );
}
