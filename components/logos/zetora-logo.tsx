// "Dérive" mark: four crossed orbits, each drifting at its own speed (two
// clockwise, two counter-clockwise) around a pupil that glances about.
// Animation classes are defined in app/globals.css (.zetora-orbit / .zetora-pupil);
// non-browser renderers (Satori OG images) should pass animated={false}.

const ORBITS = [
  { angle: 0, duration: 45, reverse: false },
  { angle: 45, duration: 65, reverse: true },
  { angle: 90, duration: 80, reverse: false },
  { angle: 135, duration: 100, reverse: true },
];

export function ZetoraLogo({
  className,
  width,
  height,
  color = 'currentColor',
  animated = true,
}: {
  className?: string;
  width?: number;
  height?: number;
  color?: string;
  animated?: boolean;
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
      {ORBITS.map(({ angle, duration, reverse }) => (
        <g key={angle} transform={`rotate(${angle} 50 50)`}>
          <ellipse
            cx="50"
            cy="50"
            rx="42"
            ry="16"
            stroke={color}
            strokeWidth="4"
            className={animated ? 'zetora-orbit' : undefined}
            style={
              animated
                ? { animationDuration: `${duration}s`, animationDirection: reverse ? 'reverse' : 'normal' }
                : undefined
            }
          />
        </g>
      ))}
      <circle cx="50" cy="50" r="9" fill={color} className={animated ? 'zetora-pupil' : undefined} />
    </svg>
  );
}
