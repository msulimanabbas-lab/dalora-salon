const P: Record<string, string> = {
  calendar: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11a2.8 2.8 0 1 0 0-5.6M16.5 14.3A5 5 0 0 1 21.5 19',
  wallet: 'M3 7h18v13H3zM3 11h18M16 15.5h2',
  chart: 'M4 20V11M10 20V5M16 20v-7M2 20h20',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9 20 18M8.1 16.1 20 6',
  team: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20a7 7 0 0 1 14 0',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  prev: 'M9 6l6 6-6 6',   // points right: "previous" in RTL
  next: 'M15 6l-6 6 6 6', // points left: "next" in RTL
  home: 'M3 11l9-7 9 7v9H15v-6H9v6H3z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  phone: 'M7 3h10v18H7zM11 18h2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.6M12 16.8h.01',
  chat: 'M4 5h16v11H10l-5 4v-4H4z',
  call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
};
export function Icon({ name, className }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={P[name] || ''} />
    </svg>
  );
}
