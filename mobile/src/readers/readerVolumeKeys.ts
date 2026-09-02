import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type ReaderVolumeDirection = 'next' | 'previous';
export type ReaderVolumeKeyPhase = 'press' | 'repeat' | 'release';

export type ReaderVolumeKeyEvent = {
  direction: ReaderVolumeDirection;
  eventTime?: number;
  phase: ReaderVolumeKeyPhase;
  repeatCount: number;
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
    return { direction: value, phase: 'press', repeatCount: 0 };
  }
  if (value === 'next:repeat' || value === 'previous:repeat') {
    return {
      direction: value.startsWith('next') ? 'next' : 'previous',
      phase: 'repeat',
      repeatCount: 1,
    };
  }
  if (typeof value === 'object' && value !== null) {
    const event = value as Record<string, unknown>;
    const direction = event.direction;
    const phase = event.phase;
    const repeatCount = event.repeatCount;
    const eventTime = event.eventTime;
    if (
      (direction === 'next' || direction === 'previous')
      && (phase === 'press' || phase === 'repeat' || phase === 'release')
      && typeof repeatCount === 'number'
      && Number.isInteger(repeatCount)
      && repeatCount >= 0
      && (eventTime === undefined || (typeof eventTime === 'number' && Number.isFinite(eventTime)))
    ) {
      return { direction, eventTime, phase, repeatCount };
    }
  }
  return null;
}

export function subscribeToReaderVolumeKeyEvents(
  onEvent: (event: ReaderVolumeKeyEvent) => void,
) {
  if (Platform.OS !== 'android' || !volumeKeysModule) return () => undefined;

  const emitter = new NativeEventEmitter(volumeKeysModule);
  volumeKeysModule.setEnabled(true);
  const subscription = emitter.addListener(EVENT_NAME, (value: unknown) => {
    const event = parseReaderVolumeKeyEvent(value);
    if (event) onEvent(event);
  });

  return () => {
    subscription.remove();
    volumeKeysModule.setEnabled(false);
  };
}

export function subscribeToReaderVolumeKeys(
  onDirection: (direction: ReaderVolumeDirection) => void,
  { allowRepeats = false }: ReaderVolumeKeysOptions = {},
) {
  return subscribeToReaderVolumeKeyEvents((event) => {
    if (event.phase === 'release' || (event.phase === 'repeat' && !allowRepeats)) return;
    onDirection(event.direction);
  });
}
