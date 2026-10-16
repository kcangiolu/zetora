import type React from 'react';

import { HugeiconsIcon } from '@/components/ui/hugeicons';

type SvgIconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;
type HugeiconsIconProp = React.ComponentProps<typeof HugeiconsIcon>['icon'];

// Renders either a Hugeicons icon or an SVG component with the same props.
export function FlexibleIcon({
  icon,
  size,
  color = 'currentColor',
  strokeWidth,
  className,
}: {
  icon: HugeiconsIconProp | SvgIconComponent;
  size: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  if (typeof icon === 'function') {
    const Icon = icon;
    return <Icon width={size} height={size} color={color} strokeWidth={strokeWidth} className={className} />;
  }

  return <HugeiconsIcon icon={icon} size={size} color={color} strokeWidth={strokeWidth} className={className} />;
}
