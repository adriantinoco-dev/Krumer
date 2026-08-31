import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type ReaderVolumeDirection = 'next' | 'previous';

type ReaderVolumeKeyEvent = {
  direction: ReaderVolumeDirection;
  repeated: boolean;
};

type ReaderVolumeKeysOptions = {
  allowRepeats?: boolean;
};

type KrumerVolumeKeysModule = {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
  setEnabled: (enabled: boolean) => void;
};

const EVENT_NAME = 'KrumerVolumeKey';
const volumeKeysModule = NativeModules.KrumerVolumeKeys as KrumerVolumeKeysModule | undefined;

export function parseReaderVolumeKeyEvent(value: unknown): ReaderVolumeKeyEvent | null {
  if (value === 'next' || value === 'previous') {
    return { direction: value, repeated: false };
  }
  if (value === 'next:repeat' || value === 'previous:repeat') {
    return {
      direction: value.startsWith('next') ? 'next' : 'previous',
      repeated: true,
    };
  }
  return null;
}

export function subscribeToReaderVolumeKeys(
  onDirection: (direction: ReaderVolumeDirection) => void,
  { allowRepeats = false }: ReaderVolumeKeysOptions = {},
) {
  if (Platform.OS !== 'android' || !volumeKeysModule) return () => undefined;

  const emitter = new NativeEventEmitter(volumeKeysModule);
  volumeKeysModule.setEnabled(true);
  const subscription = emitter.addListener(EVENT_NAME, (value: unknown) => {
    const event = parseReaderVolumeKeyEvent(value);
    if (!event || (event.repeated && !allowRepeats)) return;
    onDirection(event.direction);
  });

  return () => {
    subscription.remove();
    volumeKeysModule.setEnabled(false);
  };
}
