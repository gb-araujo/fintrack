import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'list'
  | 'bank'
  | 'card'
  | 'target'
  | 'repeat'
  | 'tag'
  | 'chart'
  | 'trending'
  | 'upload'
  | 'more';

const paths: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  bank: 'M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 21h18M12 3 3 8h18z',
  card: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm-1 4h20M6 15h4',
  target:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01',
  chart: 'M3 3v18h18M7 15v2m4-6v6m4-9v9m4-12v12',
  trending: 'M3 17l6-6 4 4 8-8m0 0h-6m6 0v6',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
