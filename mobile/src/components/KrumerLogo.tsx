import React from 'react';
import { Image, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { serifFont, spacing } from '../theme';

const logoSource = Image.resolveAssetSource(require('../../assets/Krumer-logo.svg'));
const iconSource = require('../../assets/Krumer-logo.png');

export function KrumerLogo({
  compact = false,
  useFullLogo = false,
  hideLabel = false,
  size,
}: {
  compact?: boolean;
  useFullLogo?: boolean;
  hideLabel?: boolean;
  size?: number;
}) {
  const { theme } = useApp();
  const iconSize = size ?? (compact ? 60 : 72);

  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      {useFullLogo && logoSource?.uri ? (
        <SvgUri height={iconSize} uri={logoSource.uri} width={iconSize} />
      ) : (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={iconSource}
          style={{ height: iconSize, width: iconSize }}
        />
      )}
      {!hideLabel && (
        <Text
          style={{
            color: theme.textPrimary,
            fontFamily: serifFont,
            fontSize: compact ? 18 : 28,
            fontWeight: '600',
          }}
        >
          Krumer
        </Text>
      )}
    </View>
  );
}