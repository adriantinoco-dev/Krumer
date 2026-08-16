import React from 'react';
import { Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { serifFont } from '../theme';

export function VolumeBadge({ count }: { count: number | null | undefined }) {
  const { theme, t } = useApp();

  if (!count || count <= 1) return null;

  return (
<View
      style={{
        position: 'absolute',
        right: 8,
        top: 8,
      }}
    >
      <View
        style={{
          backgroundColor: theme.accent,
          borderRadius: 8,
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
          elevation: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
          shadowColor: '#000000',
          shadowOffset: { height: 2, width: 0 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        }}
      >
        <Text style={{ color: '#ffffff', fontFamily: serifFont, fontSize: 10, fontWeight: '800' }}>
          {count} {t('library.volumesShort')}
        </Text>
      </View>
    </View>
  );
}