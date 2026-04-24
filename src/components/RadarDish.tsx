// Radar illustration: vintage scope with sweep wedge, concentric rings,
// crosshairs, and four corner dials. Editorial, monoline, paper-toned.
// Named RadarDish for import stability; the visual is the "scope" variant
// from the design prototype.

export default function RadarDish() {
  const stroke = "#1a1a17";
  const accent = "var(--accent)";

  return (
    <svg
      viewBox="0 0 600 560"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Radar scope illustration"
    >
      {/* bezel */}
      <rect
        x="80"
        y="80"
        width="440"
        height="400"
        rx="14"
        fill="#faf7f0"
        stroke={stroke}
        strokeWidth="1.6"
      />
      {/* inner frame */}
      <rect
        x="110"
        y="110"
        width="380"
        height="340"
        rx="6"
        fill="#f2efe8"
        stroke={stroke}
        strokeWidth="1"
      />

      {/* scope circle */}
      <g transform="translate(300 280)">
        <circle
          r="150"
          fill="#faf7f0"
          stroke={stroke}
          strokeWidth="1.4"
        />
        <circle
          r="115"
          fill="none"
          stroke={stroke}
          strokeWidth=".6"
          strokeDasharray="2 3"
          opacity=".6"
        />
        <circle
          r="78"
          fill="none"
          stroke={stroke}
          strokeWidth=".6"
          strokeDasharray="2 3"
          opacity=".6"
        />
        <circle
          r="38"
          fill="none"
          stroke={stroke}
          strokeWidth=".6"
          strokeDasharray="2 3"
          opacity=".6"
        />
        <line
          x1="-150"
          y1="0"
          x2="150"
          y2="0"
          stroke={stroke}
          strokeWidth=".5"
          opacity=".5"
        />
        <line
          x1="0"
          y1="-150"
          x2="0"
          y2="150"
          stroke={stroke}
          strokeWidth=".5"
          opacity=".5"
        />
        {/* sweep wedge */}
        <path
          d="M 0 0 L 130 -75 A 150 150 0 0 0 150 0 Z"
          fill={accent}
          fillOpacity="0.18"
          stroke={accent}
          strokeWidth="1"
        />
        {/* blips */}
        <circle cx="55" cy="-45" r="3" fill={accent} />
        <circle cx="-70" cy="20" r="2.2" fill={stroke} />
        <circle cx="30" cy="80" r="2.2" fill={stroke} />
      </g>

      {/* corner dials */}
      <g stroke={stroke} strokeWidth="1" fill="#faf7f0">
        <circle cx="145" cy="160" r="14" />
        <circle cx="455" cy="160" r="14" />
        <circle cx="145" cy="400" r="14" />
        <circle cx="455" cy="400" r="14" />
      </g>

      {/* dial labels */}
      <g
        fontFamily="var(--font-mono), JetBrains Mono, monospace"
        fontSize="9"
        fill="#6b6b64"
        letterSpacing=".1em"
      >
        <text x="130" y="138">GAIN</text>
        <text x="440" y="138">RANGE</text>
        <text x="130" y="430">TUNE</text>
        <text x="440" y="430">LEVEL</text>
      </g>
    </svg>
  );
}
