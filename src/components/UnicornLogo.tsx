import React from 'react';

interface UnicornLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number;
}

export const UnicornLogo: React.FC<UnicornLogoProps> = ({
  className = 'w-6 h-6',
  size,
  ...props
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      aria-label="Trade Horny Unicorn Logo"
      {...props}
    >
      {/* Unicorn Head Silhouette */}
      <path
        d="
          M 52 34
          L 95 6
          L 58 37
          C 65 44, 73 50, 79 56
          C 83 60, 82 66, 76 69
          C 71 71, 64 68, 61 65
          C 57 63, 55 69, 55 77
          C 55 83, 58 90, 62 94
          L 22 94
          C 22 86, 25 79, 27 73
          C 21 71, 22 63, 29 57
          C 24 54, 26 46, 33 41
          C 29 39, 31 33, 37 28
          L 39 28
          C 40 24, 41 17, 43 11
          C 46 16, 48 23, 49 29
          C 51 31, 52 33, 52 34
          Z
        "
        fillRule="evenodd"
      />
      {/* Horn Spiral Details (Subtle cutouts for depth) */}
      <path
        d="M 68 25 L 72 29"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="opacity-40"
      />
      <path
        d="M 78 18 L 81 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="opacity-40"
      />
      <path
        d="M 87 11 L 89 13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="opacity-40"
      />
      {/* Sleek Eye Cutout */}
      <path
        d="M 59 47 C 62 45, 65 46, 67 49 C 64 50, 61 50, 59 47 Z"
        className="fill-slate-950"
      />
      {/* Nostril Cutout */}
      <circle cx="75" cy="62" r="1.5" className="fill-slate-950" />
    </svg>
  );
};

export default UnicornLogo;
