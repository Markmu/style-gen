import type { SVGProps } from "react";

interface VisorynMarkProps extends SVGProps<SVGSVGElement> {
  title?: string;
}

/**
 * Visoryn's four-point lens mark.
 *
 * Keep this path in sync with public/visoryn-mark.svg so in-product branding
 * and browser/manifest icons share the same silhouette.
 */
export function VisorynMark({ title, ...props }: VisorynMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...props}
    >
      <path
        d="M16 2C17.8 8.2 22.9 13.4 30 16C22.9 18.6 17.8 23.8 16 30C14.2 23.8 9.1 18.6 2 16C9.1 13.4 14.2 8.2 16 2Z"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
