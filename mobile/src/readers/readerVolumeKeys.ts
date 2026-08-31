import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type ReaderVolumeDirection = 'next' | 'previous';

type KrumerVolumeKeysModule = {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
  setEnabled: (enabled: boolean) => void;
};

const EVENT_NAME = 'KrumerVolumeKey';
const volumeKeysModule = NativeModules.KrumerVolumeKeys as KrumerVolumeKeysModule | undefined;

export function subscribeToReaderVolumeKeys(
  onDirection: (direction: ReaderVolumeDirection) => void,
) {
  if (Platform.OS !== 'android' || !volumeKeysModule) return () => undefined;

  const emitter = new NativeEventEmitter(volumeKeysModule);
  volumeKeysModule.setEnabled(true);
  const subscription = emitter.addListener(EVENT_NAME, (value: unknown) => {
    if (value === 'next' || value === 'previous') onDirection(value);
  });

  return () => {
    subscription.remove();
    volumeKeysModule.setEnabled(false);
  };
}
