import type { SVGProps } from "react";

/** Paths on a 24px grid, drawn with one 1.75 stroke, round caps and joins. */
const PATHS = {
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M17.5 14.8c2.1.6 3.5 2.5 3.5 5.2",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  download: "M12 4v11M7 10.5 12 15.5l5-5M5 19.5h14",
  plus: "M12 5v14M5 12h14",
  logout: "M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
  /** Rendered size in pixels (square). */
  size?: number;
};

/** Decorative icon: always hidden from assistive technology; the control names itself. */
export default function Icon({ name, size = 18, ...svg }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...svg}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
