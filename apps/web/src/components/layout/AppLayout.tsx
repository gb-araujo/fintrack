import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export function AppLayout() {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 md:hidden">
          <span className="text-base font-semibold tracking-tight">FINTRACK</span>
          <div className="flex items-center gap-1">
            <ThemeToggle compact />
            <UserMenu compact />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
