import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type Props = {
  color?: string;
  size?: number;
};

/**
 * Stylized dual-badge Translation & Language icon (文A).
 * Features layered geometric badges with depth, subtle tinting, and crisp typography.
 */
export function LanguageIcon({ color = '#f97316', size = 20 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Top-Left Badge (East Asian '文') */}
      <Rect
        x="2"
        y="2"
        width="12.5"
        height="12.5"
        rx="3.5"
        stroke={color}
        strokeWidth="1.6"
        fill={color}
        fillOpacity="0.14"
      />
      {/* '文' Top Dot */}
      <Path
        d="M8.25 4.5V5.8"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* '文' Top Horizontal Bar */}
      <Path
        d="M4.8 6.2H11.7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* '文' Left Diagonal Sweep */}
      <Path
        d="M9.2 6.5C9 8.6 7.4 10.4 5.2 11.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* '文' Right Diagonal Sweep */}
      <Path
        d="M6.5 8.2C8 9.5 9.4 10.8 11.4 11.8"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Bottom-Right Badge (Western 'A') */}
      <Rect
        x="9.5"
        y="9.5"
        width="12.5"
        height="12.5"
        rx="3.5"
        stroke={color}
        strokeWidth="1.6"
        fill={color}
        fillOpacity="0.22"
      />
      {/* 'A' Diagonal Legs */}
      <Path
        d="M12.8 18.8L15.75 12.2L18.7 18.8"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 'A' Crossbar */}
      <Path
        d="M13.9 16.6H17.6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}
