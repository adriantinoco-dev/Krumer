import React from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { serifFont, spacing } from '../theme';

const iconSource = require('../../assets/Krumer-logo.png');

function getLogoSource(): { uri?: string } | null {
  if (Platform.OS === 'web') return null;
  try {
    const req = require('../../assets/Krumer-logo.svg');
    const resolver = (Image as unknown as { resolveAssetSource?: (s: number) => { uri: string } })
      .resolveAssetSource;
    if (typeof resolver === 'function') return resolver(req);
    return null;
  } catch {
    return null;
  }
}

const logoSource = getLogoSource();

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
  const iconSize = size ?? (compact ? 40 : 52);

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