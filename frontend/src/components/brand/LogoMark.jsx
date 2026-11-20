export default function LogoMark({ className = '', title }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title || undefined}
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M17 8 H32 A24 24 0 0 1 32 56 H17 A5 5 0 0 1 12 51 V13 A5 5 0 0 1 17 8 Z
           M17.5 12.5 H32 A19.5 19.5 0 0 1 32 51.5 H17.5 A1 1 0 0 1 16.5 50.5 V13.5 A1 1 0 0 1 17.5 12.5 Z"
      />
      <path
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
        d="M23.2 19.45 L30.7 23.17 V40.83 L23.2 44.55 Z"
      />
    </svg>
  );
}
