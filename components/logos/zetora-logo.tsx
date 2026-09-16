// "Z" mark: traced from the approved reference artwork (7 vertices per bar,
// 6 for the diagonal), scaled into a 0-100 viewBox. Satori (next/og) can
// render this fine since it's a single filled path with no <mask>.

// Also used by ZetoraWordmark (zetora-wordmark.tsx) so the icon and the
// logotype always share the exact same Z.
export const Z_PATH =
  'M 16.83,3.0 L 69.19,3.0 L 45.57,26.62 L 22.73,26.46 L 13.1,36.25 L 3.0,26.15 L 3.0,16.98 Z M 71.67,4.55 L 84.1,16.67 L 84.1,25.68 L 14.96,94.82 L 3.0,82.86 L 3.0,73.54 Z M 73.85,63.6 L 84.1,73.54 L 84.1,82.86 L 69.97,97.0 L 16.98,97.0 L 40.29,73.54 L 63.91,73.54 Z';
export const Z_WIDTH = 84.1;

export function ZetoraLogo({
  className,
  width,
  height,
  color = 'currentColor',
}: {
  className?: string;
  width?: number;
  height?: number;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={width}
      height={height}
      color={color}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path d={Z_PATH} fill={color} />
    </svg>
  );
}
