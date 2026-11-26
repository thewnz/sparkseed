// Crafted 24x24 architectural icons with optical contrast (1.7px stroke + subtle tonal fills on module emblems).
// Designed for tactile clarity in desktop research workspaces.

const glyphs = {
  compose: <>
    <path d="M12.5 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H17a1.5 1.5 0 0 0 1.5-1.5v-6" />
    <path d="m16.8 3.6 3.6 3.6L12 15.6l-4.2.8.8-4.2 8.2-8.6Z" fill="currentColor" fillOpacity="0.16" />
    <path d="m15.2 5.2 3.6 3.6" />
  </>,
  capture: <>
    <path d="M8.5 4.5H6A1.5 1.5 0 0 0 4.5 6v2.5M15.5 4.5H18A1.5 1.5 0 0 1 19.5 6v2.5M4.5 15.5V18A1.5 1.5 0 0 0 6 19.5h2.5M19.5 15.5V18a1.5 1.5 0 0 1-1.5 1.5h-2.5" />
    <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.18" />
    <path d="M12 9.5v5M9.5 12h5" />
  </>,
  microphone: <>
    <rect x="9.2" y="3.5" width="5.6" height="10.5" rx="2.8" fill="currentColor" fillOpacity="0.16" />
    <path d="M6.2 11.2a5.8 5.8 0 0 0 11.6 0M12 17v3.5M9.2 20.5h5.6" />
  </>,
  discussion: <>
    <path d="M6.5 5h11A1.5 1.5 0 0 1 19 6.5v7.2a1.5 1.5 0 0 1-1.5 1.5H9.8L5 18.5V6.5A1.5 1.5 0 0 1 6.5 5Z" fill="currentColor" fillOpacity="0.14" />
    <path d="M8.5 8.8h7M8.5 11.8h4.5" />
  </>,
  socratic: <>
    <path d="M5.5 5h10A1.5 1.5 0 0 1 17 6.5v6A1.5 1.5 0 0 1 15.5 14H9.4L5.5 17V6.5A1.5 1.5 0 0 1 7 5Z" fill="currentColor" fillOpacity="0.16" />
    <path d="M8.5 8.6h5.5M8.5 11.2h3.5" />
    <path d="M12 16.5h6.5l2 2v-6.5a1.5 1.5 0 0 0-1.5-1.5H17" />
  </>,
  preferences: <>
    <path d="M4.5 7h7.8m4.4 0h2.8M4.5 12h2.8m4.4 0h7.8M4.5 17h7.8m4.4 0h2.8" />
    <circle cx="14.5" cy="7" r="2.2" fill="currentColor" fillOpacity="0.22" />
    <circle cx="9.5" cy="12" r="2.2" fill="currentColor" fillOpacity="0.22" />
    <circle cx="14.5" cy="17" r="2.2" fill="currentColor" fillOpacity="0.22" />
  </>,
  book: <>
    <path d="M12 6.2C9.8 4.8 6.8 4.5 4 5.2v12.6c2.8-.7 5.8-.4 8 1V6.2Z" fill="currentColor" fillOpacity="0.16" />
    <path d="M12 6.2C9.8 4.8 6.8 4.5 4 5.2v12.6c2.8-.7 5.8-.4 8 1 2.2-1.4 5.2-1.7 8-1V5.2c-2.8-.7-5.8-.4-8 1ZM12 6.2v12.6" />
    <path d="M6.5 8.8h3M6.5 11.6h2.5M14.5 8.8h3M14.5 11.6h2.5" />
  </>,
  document: <>
    <path d="M7.5 4H14l4 4v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5.5A1.5 1.5 0 0 1 7.5 4Z" fill="currentColor" fillOpacity="0.12" />
    <path d="M14 4v4h4" fill="currentColor" fillOpacity="0.24" />
    <path d="M9 11.8h6M9 14.8h6M9 17.4h3.8" />
  </>,
  media: <>
    <rect x="4" y="5" width="16" height="14" rx="2.2" fill="currentColor" fillOpacity="0.12" />
    <circle cx="9" cy="9.5" r="1.5" fill="currentColor" />
    <path d="m4.5 16.5 4.8-4.5 3.5 3.2 2.7-2.4 4 3.7" />
  </>,
  chart: <>
    <path d="M4.5 4.5v14a1 1 0 0 0 1 1h14" />
    <rect x="7.5" y="12.5" width="2.6" height="6" rx="0.6" fill="currentColor" fillOpacity="0.24" />
    <rect x="11.8" y="7.5" width="2.6" height="11" rx="0.6" fill="currentColor" fillOpacity="0.24" />
    <rect x="16.1" y="10" width="2.6" height="8.5" rx="0.6" fill="currentColor" fillOpacity="0.24" />
  </>,
  flow: <>
    <rect x="8.5" y="3.5" width="7" height="4.5" rx="1.2" fill="currentColor" fillOpacity="0.22" />
    <rect x="3.5" y="15.5" width="6.5" height="4.5" rx="1.2" fill="currentColor" fillOpacity="0.14" />
    <rect x="14" y="15.5" width="6.5" height="4.5" rx="1.2" fill="currentColor" fillOpacity="0.14" />
    <path d="M12 8v3.8M6.8 15.5v-2.2a1.5 1.5 0 0 1 1.5-1.5h7.4a1.5 1.5 0 0 1 1.5 1.5v2.2" />
  </>,
  library: <>
    <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5" fill="currentColor" fillOpacity="0.2" />
    <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5" />
    <rect x="13" y="13" width="6.5" height="6.5" rx="1.5" fill="currentColor" fillOpacity="0.2" />
  </>,
  constellation: <>
    <path d="m8.2 7.4 7.3-.7M7.6 9.2l4.7 6M16.7 8.4l-2.3 6.4" />
    <circle cx="6.5" cy="7.5" r="2.2" fill="currentColor" fillOpacity="0.24" />
    <circle cx="17.5" cy="6.5" r="2.2" fill="currentColor" fillOpacity="0.24" />
    <circle cx="13.5" cy="17" r="2.5" fill="currentColor" fillOpacity="0.32" />
  </>,
  stars: <>
    <path d="m8.2 7.4 7.3-.7M7.6 9.2l4.7 6M16.7 8.4l-2.3 6.4" />
    <circle cx="6.5" cy="7.5" r="2.2" fill="currentColor" fillOpacity="0.24" />
    <circle cx="17.5" cy="6.5" r="2.2" fill="currentColor" fillOpacity="0.24" />
    <circle cx="13.5" cy="17" r="2.5" fill="currentColor" fillOpacity="0.32" />
  </>,
  pin: <>
    <path d="m14.2 4.5 5.3 5.3-3.8 3.8-.8 3.2-6.7-6.7 3.2-.8 2.8-4.8ZM8.5 15.5 4.5 19.5" />
  </>,
  trash: <>
    <path d="M4.8 7h14.4M9.5 7V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7m2.3 0-.8 11.8a1.5 1.5 0 0 1-1.5 1.4H9.5A1.5 1.5 0 0 1 8 18.8L7.2 7m3.2 3.5v5.2m3.2-5.2v5.2" />
  </>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  center: <>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M12 4v3m0 10v3M4 12h3m10 0h3" />
  </>,
  pause: <>
    <rect x="7.5" y="5.5" width="3" height="13" rx="0.8" />
    <rect x="13.5" y="5.5" width="3" height="13" rx="0.8" />
  </>,
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  sidebar: <>
    <rect x="4.5" y="5" width="15" height="14" rx="1.8" />
    <path d="M9.5 5v14" />
  </>,
  search: <>
    <circle cx="10.8" cy="10.8" r="6.2" />
    <path d="m15.4 15.4 4.1 4.1" />
  </>,
  repository: <>
    <path d="M6.5 4.5h10.5A1.5 1.5 0 0 1 18.5 6v13.5H7A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5Z" fill="currentColor" fillOpacity="0.12" />
    <path d="M5.5 16.5h13" />
    <path d="m9.5 8.8-1.8 1.8 1.8 1.8m4.5-3.6 1.8 1.8-1.8 1.8" />
  </>,
  web: <>
    <circle cx="12" cy="12" r="8.2" fill="currentColor" fillOpacity="0.1" />
    <path d="M4.2 12h15.6M12 3.8c2.2 2.2 3.4 5.1 3.4 8.2s-1.2 6-3.4 8.2c-2.2-2.2-3.4-5.1-3.4-8.2s1.2-6 3.4-8.2Z" />
  </>,
  skill: <>
    <path d="M12 3.8 19 7.9v8.2l-7 4.1-7-4.1V7.9l7-4.1Z" fill="currentColor" fillOpacity="0.14" />
    <path d="M12 8.8v6.4M8.8 12h6.4" />
  </>,
  import: <>
    <path d="M5 14v4a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-4M12 4.5v10.2m-3.6-3.5L12 14.8l3.6-3.6" />
  </>,
  excerpt: <>
    <path d="M9.5 7.5H6A1.5 1.5 0 0 0 4.5 9v9A1.5 1.5 0 0 0 6 19.5h9a1.5 1.5 0 0 0 1.5-1.5v-3.5" />
    <rect x="9.5" y="4.5" width="10" height="10" rx="1.6" />
    <path d="M12 8.2h5M12 11h3.2" />
  </>,
  location: <>
    <path d="M6.5 4.5h11a.5.5 0 0 1 .5.5v14.5L12 16.2 6 19.5V5a.5.5 0 0 1 .5-.5ZM9.2 8.8h5.6M9.2 11.8h3.6" />
  </>,
  send: <path d="M12 18.5V5.5m-4.8 4.8L12 5.5l4.8 4.8" />,
  check: <path d="m5.2 12.4 4.2 4.2L18.8 7" />,
  back: <path d="M18.5 12H5.5m4.8-4.8L5.5 12l4.8 4.8" />,
  forward: <path d="M5.5 12h13m-4.8-4.8L18.5 12l-4.8 4.8" />,
  connection: <>
    <path d="M9.2 4.5V8m5.6-3.5V8M7 8h10v2.6a5 5 0 0 1-10 0V8Zm5 7.6v3.9m-3.2 0h6.4" />
  </>,
  agent: <>
    <rect x="5" y="5" width="14" height="14" rx="2.8" fill="currentColor" fillOpacity="0.14" />
    <circle cx="9.2" cy="10" r="1.4" fill="currentColor" />
    <circle cx="14.8" cy="10" r="1.4" fill="currentColor" />
    <circle cx="12" cy="14.8" r="1.5" fill="currentColor" />
    <path d="M9.8 11.2 11.4 13.6M14.2 11.2 12.6 13.6M9.5 3v2m5-2v2M9.5 19v2m5-2v2M3 9.5h2m-2 5h2M19 9.5h2m-2 5h2" />
  </>,
  keyboard: <>
    <rect x="3.5" y="6" width="17" height="12" rx="2" />
    <path d="M7 10h1m3.5 0h1m3.5 0h1M7 14h10" />
  </>,
  system: <>
    <rect x="4.5" y="5" width="15" height="10.5" rx="1.5" />
    <path d="M8.5 19h7M12 15.5V19" />
  </>,
  appearance: <>
    <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity="0.1" />
    <path d="M12 4v16" />
    <path d="M12 8.5h4.8M12 12h6.8M12 15.5h4.8" />
  </>,
  refresh: <path d="M18.8 8.5A7.2 7.2 0 0 0 6.3 6.2L4.8 7.8m0-3.6v3.6h3.6M5.2 15.5a7.2 7.2 0 0 0 12.5 2.3l1.5-1.6m0 3.6v-3.6h-3.6" />,
  terminal: <>
    <rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" fillOpacity="0.12" />
    <path d="m8 9.5 2.8 2.5L8 14.5m4.8 0h3.5" />
  </>,
  memory: <>
    <path d="M6.5 4.5h10.5A1.5 1.5 0 0 1 18.5 6v13.5H7A1.5 1.5 0 0 1 5.5 18V6a1.5 1.5 0 0 1 1-1.5Z" fill="currentColor" fillOpacity="0.12" />
    <path d="M5.5 16.5h13M9 8.5h5.5M9 11.8h3.8" />
  </>,
  soul: <>
    <circle cx="12" cy="12" r="7.8" fill="currentColor" fillOpacity="0.1" />
    <path d="m14.8 9.2-1.8 3.8-3.8 1.8 1.8-3.8 3.8-1.8Z" fill="currentColor" fillOpacity="0.22" />
  </>,
  history: <>
    <path d="M4.6 10.2A7.8 7.8 0 1 1 6.2 17M4.4 6.5v4h4M12 8.2v4l2.8 1.8" />
  </>,
  notice: <>
    <path d="M12 4.5 3.8 19h16.4L12 4.5Zm0 5.2v4.2m0 2.8h.01" />
  </>,
  guide: <>
    <circle cx="12" cy="12" r="8.2" fill="currentColor" fillOpacity="0.14" />
    <path d="m14.8 9.2-1.8 4-4 1.8 1.8-4 4-1.8Z" fill="currentColor" fillOpacity="0.32" />
  </>,
  external: <path d="M14 4.5h5.5V10m0-5.5-8.5 8.5M18.5 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7A1.5 1.5 0 0 1 6 5.5h4.5" />,
  star: <path d="m12 4.2 2.3 4.8 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.7L12 4.2Z" fill="currentColor" fillOpacity="0.18" />,
  tag: <path d="M4.5 5h7.2l7.8 7.8-6.7 6.7L4.5 11.2V5Zm3.5 3.5h.01" />,
  bolt: <path d="M13 3.5 5.8 13.5h5.7l-.8 7 7.5-10h-5.7l.5-7Z" fill="currentColor" fillOpacity="0.2" />,
  command: <path d="M7.5 4.5a2.5 2.5 0 1 0 2.5 2.5V4.5H7.5Zm9 0A2.5 2.5 0 1 1 14 7V4.5h2.5ZM7.5 19.5A2.5 2.5 0 1 1 10 17v2.5H7.5Zm9 0A2.5 2.5 0 1 0 14 17v2.5h2.5ZM10 7h4v10h-4V7Z" />,
  grid: <>
    <rect x="4.5" y="4.5" width="6.2" height="6.2" rx="1.2" />
    <rect x="13.3" y="4.5" width="6.2" height="6.2" rx="1.2" />
    <rect x="4.5" y="13.3" width="6.2" height="6.2" rx="1.2" />
    <rect x="13.3" y="13.3" width="6.2" height="6.2" rx="1.2" />
  </>,
  list: <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.8 6.5h.5M4.8 12h.5M4.8 17.5h.5" />,
  layers: <>
    <path d="m12 3.8 8.2 4.4L12 12.6 3.8 8.2 12 3.8Z" fill="currentColor" fillOpacity="0.22" />
    <path d="M3.8 12l8.2 4.4 8.2-4.4M3.8 16l8.2 4.2 8.2-4.2" />
  </>,
  sliders: <>
    <path d="M4.5 8h8.8m4.4 0h1.8M4.5 16h1.8m4.4 0h8.8" />
    <circle cx="15.5" cy="8" r="2.1" />
    <circle cx="8.5" cy="16" r="2.1" />
  </>,
  eye: <>
    <path d="M2.8 12S6.2 6.5 12 6.5 21.2 12 21.2 12 17.8 17.5 12 17.5 2.8 12 2.8 12Z" />
    <circle cx="12" cy="12" r="2.4" />
  </>,
  copy: <>
    <rect x="8.5" y="8.5" width="10.5" height="10.5" rx="1.6" />
    <path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 4h8a1.5 1.5 0 0 1 1.5 1.5V6" />
  </>,
  moon: <path d="M19.5 14.4A7.8 7.8 0 0 1 9.6 4.5a7.8 7.8 0 1 0 9.9 9.9Z" />,
  sun: <>
    <circle cx="12" cy="12" r="3.8" />
    <path d="M12 3.5v2m0 13v2M20.5 12h-2m-13 0h-2m14.5-6-1.4 1.4M7.4 16.6 6 18m0-12 1.4 1.4m9.2 9.2 1.4 1.4" />
  </>,
  split: <>
    <rect x="4" y="5" width="16" height="14" rx="1.6" />
    <path d="M12 5v14" />
  </>,
  columns: <>
    <rect x="4" y="5" width="16" height="14" rx="1.6" />
    <path d="M9.5 5v14M14.5 5v14" />
  </>,
  maximize: <path d="M14.5 4.5h5v5m0-5-6 6M9.5 19.5h-5v-5m0 5 6-6" />,
  minimize: <path d="M4.5 14.5h5v5m0-5-5.5 5.5M19.5 9.5h-5v-5m0 5 5.5-5.5" />,
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevronRight: <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  filter: <path d="M4.5 5.5h15l-5.8 6.8v5.2l-3.4 1.8v-7L4.5 5.5Z" />,
  queue: <>
    <rect x="4.5" y="5" width="15" height="14" rx="2.2" fill="currentColor" fillOpacity="0.14" />
    <path d="m8 9.5 1.3 1.3 2.5-2.6M13.8 9.5h2.7M8 14.5h8.5" />
  </>,
  radar: <>
    <rect x="4.5" y="5" width="15" height="14" rx="2.2" fill="currentColor" fillOpacity="0.14" />
    <path d="m8 9.5 1.5 1.5 3-3M14.5 9.5h2M8 14.8h8.5" />
  </>,
  quote: <path d="M9.8 8.2H6.2v4.4h3.6v2.6A2.8 2.8 0 0 1 7 18m10.8-9.8h-3.6v4.4h3.6v2.6A2.8 2.8 0 0 1 15 18" />,
  shield: <path d="M12 3.5 5.2 6.2v5.6c0 4.3 2.9 7.5 6.8 8.7 3.9-1.2 6.8-4.4 6.8-8.7V6.2L12 3.5Zm-2.4 8.4 1.8 1.8 3.4-3.4" fill="currentColor" fillOpacity="0.16" />,
  focus: <>
    <path d="M4.5 8.5V6A1.5 1.5 0 0 1 6 4.5h2.5M15.5 4.5H18A1.5 1.5 0 0 1 19.5 6v2.5M4.5 15.5V18A1.5 1.5 0 0 0 6 19.5h2.5M19.5 15.5V18a1.5 1.5 0 0 1-1.5 1.5h-2.5" />
    <path d="M9 10.5h6M9 13.5h4" />
  </>,
  sort: <path d="M7.5 5v14m0 0-3-3m3 3 3-3M16.5 19V5m0 0-3 3m3-3 3 3" />,
  template: <>
    <rect x="4.5" y="4.5" width="15" height="15" rx="1.8" fill="currentColor" fillOpacity="0.12" />
    <path d="M4.5 9.2h15M9.5 9.2v10.3" />
  </>,
  bibtex: <path d="M8.5 7C7.2 7 6.8 7.8 6.8 8.8v1.6c0 .9-.5 1.6-1.5 1.6 1 0 1.5.7 1.5 1.6v1.6c0 1 .4 1.8 1.7 1.8M15.5 7c1.3 0 1.7.8 1.7 1.8v1.6c0 .9.5 1.6 1.5 1.6-1 0-1.5.7-1.5 1.6v1.6c0 1-.4 1.8-1.7 1.8" />,
};

export function Icon({ name, className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.68"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {glyphs[name] || glyphs.constellation}
  </svg>;
}
