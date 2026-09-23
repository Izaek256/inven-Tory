/**
 * Sidebar nav icons — geometric SVGs lifted from the invenTory Dashboard
 * artifact (square caps/joins, currentColor strokes, 1.6px at 16px).
 *
 * Same call signature as Lucide icons (`size` prop) so nav definitions can
 * mix artifact icons with Lucide ones (e.g. the hidden legacy entry).
 */
import React from 'react';

export type NavIconProps = {
  size?: number | string;
} & React.SVGProps<SVGSVGElement>;

export type NavIcon = React.ComponentType<NavIconProps>;

function Base({
  size = 16,
  children,
  ...props
}: NavIconProps & { children: React.ReactNode }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: NavIconProps): React.ReactElement {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7" height="9" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="3" width="7" height="5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="12" width="7" height="9" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="16" width="7" height="5" stroke="currentColor" strokeWidth="1.6" />
    </Base>
  );
}

export function MovementsIcon(props: NavIconProps): React.ReactElement {
  return (
    <Base {...props}>
      <path
        d="M17 3L21 7L17 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d="M21 7H8C5.2 7 3 9.2 3 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
      <path
        d="M7 21L3 17L7 13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d="M3 17H16C18.8 17 21 14.8 21 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
    </Base>
  );
}

export function ProductsIcon(props: NavIconProps): React.ReactElement {
  return (
    <Base {...props}>
      <rect
        x="4"
        y="4"
        width="10"
        height="10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="miter"
      />
      <rect
        x="10"
        y="10"
        width="10"
        height="10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="miter"
      />
    </Base>
  );
}

export function StoresIcon(props: NavIconProps): React.ReactElement {
  return (
    <Base {...props}>
      <path
        d="M4 9L12 4L20 9V19C20 19.6 19.6 20 19 20H5C4.4 20 4 19.6 4 19V9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="miter"
      />
      <path d="M9 20V13H15V20" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
    </Base>
  );
}
