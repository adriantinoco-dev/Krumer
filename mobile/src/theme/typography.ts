import { Platform } from 'react-native';

export const serifFont = Platform.select({
  ios: 'Georgia',
  default: 'serif',
}) as string;

export const monoFont = 'Courier';