import React from 'react';

const paths = {
  edit: 'M4 16.5 15.8 4.7a2 2 0 0 1 2.9 0l.6.6a2 2 0 0 1 0 2.9L7.5 20H4z M14.4 6.1l3.5 3.5',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 10v7 M14 10v7',
  more: 'M5 12h.3 M12 12h.3 M19 12h.3',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  home: 'M3 10.5 12 3l9 7.5 M5 9v11h5v-6h4v6h5V9',
  search: 'M20 20l-4.4-4.4 M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0',
  folder: 'M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  plus: 'M12 5v14 M5 12h14', close: 'M6 6l12 12 M18 6L6 18',
  chevron: 'M8 10l4 4 4-4', arrow: 'M9 5l7 7-7 7', check: 'M5 12l4 4L19 6',
  save: 'M6 4h12a1 1 0 011 1v15l-7-4-7 4V5a1 1 0 011-1z',
  sales: 'M4 19h16 M6 15v-4 M12 15V5 M18 15V8',
  customer: 'M15.5 8a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0 M4.5 20v-1a7.5 7.5 0 0115 0v1',
  product: 'M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z M3.5 7.5l8.5 4.7 8.5-4.7 M12 12.2V21 M7.7 5.3l8.5 4.5',
  trip: 'M3 6h12v11H3z M15 10h3l3 4v3h-6 M8 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0 M20 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0',
  grid: 'M4 5h16v14H4z M4 10h16 M10 5v14',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.5 9a2.5 2.5 0 1 1 4.3 1.7c-1 1-1.8 1.2-1.8 2.8m0 3h.01',
  collapse: 'M4 5v14m16-7H8m4-4-4 4 4 4',
  play: 'M7 4.5v15l12-7.5z', layers: 'M3 8l9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  device: 'M3 5h18v12H3z M8 21h8 M12 17v4',
  date: 'M4 7h16v13H4z M4 11h16 M8 4v5 M16 4v5',
  document: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',
  fields: 'M4 6h16 M4 12h16 M4 18h16 M8 4v4 M15 10v4 M10 16v4',
  grip: 'M9 6h.1 M15 6h.1 M9 12h.1 M15 12h.1 M9 18h.1 M15 18h.1',
  clock: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0 M12 7v5l3 2',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 118 0v3',
};
export type IconName = keyof typeof paths;
export function Icon({name, size = 18}: {name: IconName; size?: number}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={name === 'grip' || name === 'more' ? 3 : 1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} /></svg>;
}
