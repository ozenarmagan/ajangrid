type P = { size?: number }

const base = (size: number): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
})

export const Logo = ({ size = 16 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="5" cy="18" r="2.5" />
    <circle cx="19" cy="18" r="2.5" />
    <path d="M12 7.5v4M12 11.5l-5.5 4.5M12 11.5l5.5 4.5" />
  </svg>
)
export const Sun = ({ size = 15 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
export const Moon = ({ size = 15 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
)
export const Stop = ({ size = 14 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
)
export const Expand = ({ size = 14 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
)
export const Shrink = ({ size = 14 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
  </svg>
)
export const Folder = ({ size = 14 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)
export const File = ({ size = 14 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
  </svg>
)
export const Refresh = ({ size = 14 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
  </svg>
)
export const Trash = ({ size = 14 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
)
export const Plus = ({ size = 14 }: P): React.JSX.Element => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
