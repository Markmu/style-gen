import type { LucideIcon, LucideProps } from "lucide-react";

interface AppIconProps extends Omit<LucideProps, "ref"> {
  icon: LucideIcon;
  label?: string;
}

/** Shared Lucide outline treatment for functional product icons. */
export function AppIcon({
  icon: Icon,
  label,
  size = 18,
  strokeWidth = 1.75,
  ...props
}: AppIconProps) {
  return (
    <Icon
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      {...props}
    />
  );
}

export type { LucideIcon as AppIconComponent };
