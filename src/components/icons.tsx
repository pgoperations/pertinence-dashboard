import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconSales(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M3 21h18" />
      <path d="M6 21V10" />
      <path d="M11 21V4" />
      <path d="M16 21v-7" />
      <path d="M21 21v-3" />
    </svg>
  );
}

export function IconMarketing(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M3 11v3a2 2 0 0 0 2 2h1l4 4V5l-4 4H5a2 2 0 0 0-2 2Z" />
      <path d="M16 8a5 5 0 0 1 0 8" />
      <path d="M19 5a9 9 0 0 1 0 14" />
    </svg>
  );
}

export function IconSupport(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

export function IconRealtors(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconMedia(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5-9 9" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function IconLogOut(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.62 18.62 0 0 1 4.16-5.19" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 7 10 7a18.84 18.84 0 0 1-2.7 3.78" />
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

export function IconCloudDownload(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.74A6 6 0 0 0 4 12c0 .27.02.54.06.8" />
      <path d="M12 13v8" />
      <path d="m8 17 4 4 4-4" />
    </svg>
  );
}

export function IconSparkles(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M5 12H3" />
      <path d="M21 12h-2" />
      <path d="M12 7c0 2.76 2.24 5 5 5-2.76 0-5 2.24-5 5 0-2.76-2.24-5-5-5 2.76 0 5-2.24 5-5Z" />
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
