const paths = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  file: 'M7 3.5h7l5 5V20.5H7zM14 3.5V9h5',
  check: 'M5 12.5l4.2 4.2L19 7.5',
  quotes: 'M7 8h10M7 12h10M7 16h6',
  po: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3',
  truck: 'M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  project: 'M4 19V5h6l2 2h8v12z',
  invoice: 'M7 3h10v18l-2-1.2L13 21l-2-1.2L9 21l-2-1.2zM9 8h6M9 12h6',
  pay: 'M3 7h18v10H3zM3 11h18',
  chart: 'M5 19V10M10 19V5M15 19v-6M20 19V8',
  admin: 'M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 19.5a7 7 0 0 1 14 0',
  audit: 'M8 4h8v16H8zM10 8h4M10 12h4M10 16h2',
  bell: 'M6 16h12l-1.2-2.2V10a4.8 4.8 0 0 0-9.6 0v3.8zM10 16a2 2 0 0 0 4 0',
  comment: 'M5 6h14v9H8l-3 3z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16.5 16.5L21 21',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  lock: 'M8 11V8a4 4 0 0 1 8 0v3M6 11h12v9H6z',
  chevron: 'M6 9l6 6 6-6',
  download: 'M12 4v10M8 10l4 4 4-4M5 19h14',
  flask: 'M9 3h6M10 3v6L6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l-4-10V3',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 3.5v2.2M12 18.3v2.2M4.8 6.6l1.6 1.6M17.6 15.8l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.4l1.6-1.6M17.6 8.2l1.6-1.6',
  layers: 'M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  plus: 'M12 5v14M5 12h14',
  building: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
  flag: 'M6 21V4h9l-2 4 2 4H6',
  calendar: 'M7 4v3M17 4v3M5 9h14M6 5h12a1 1 0 0 1 1 1v12H5V6a1 1 0 0 1 1-1z',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z',
}

export function Icon({ name, size = 18 }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.file} />
    </svg>
  )
}
