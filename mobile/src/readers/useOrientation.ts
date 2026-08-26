import { useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { ReaderOrientation } from '../models/readingPreferences';

export function usePortraitOrientation() {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .catch((error) => {
        console.warn('[Krumer] nao foi possivel bloquear a orientacao vertical', error);
      });
  }, []);
}

function lockForPreference(preference: ReaderOrientation) {
  if (preference === 'landscape') return ScreenOrientation.OrientationLock.LANDSCAPE;
  if (preference === 'portrait') return ScreenOrientation.OrientationLock.PORTRAIT;
  return ScreenOrientation.OrientationLock.ALL;
}

export function useOrientation(preference: ReaderOrientation = 'free') {
  const { height, width } = useWindowDimensions();
  const preferenceRef = useRef(preference);
  const initializedRef = useRef(false);
  preferenceRef.current = preference;

  useEffect(() => {
    let cancelled = false;
    let didApplyReaderLock = false;
    let previousLock: ScreenOrientation.OrientationLock = ScreenOrientation.OrientationLock.PORTRAIT_UP;

    const applyReaderOrientation = ScreenOrientation.getOrientationLockAsync()
      .then((lock) => {
        previousLock = lock === ScreenOrientation.OrientationLock.PORTRAIT
          || lock === ScreenOrientation.OrientationLock.PORTRAIT_UP
          ? lock
          : ScreenOrientation.OrientationLock.PORTRAIT_UP;
        if (cancelled) return;
        return ScreenOrientation.lockAsync(lockForPreference(preferenceRef.current)).then(() => {
          didApplyReaderLock = true;
          initializedRef.current = true;
          // Preferences can hydrate while the first native lock is still pending.
          return ScreenOrientation.lockAsync(lockForPreference(preferenceRef.current));
        });
      })
      .catch((error) => {
        console.warn('[Krumer Reader] nao foi possivel aplicar a orientacao', error);
      });

    return () => {
      cancelled = true;
      initializedRef.current = false;
      void applyReaderOrientation.then(() => {
        if (!didApplyReaderLock) return;
        return ScreenOrientation.lockAsync(previousLock).catch((error) => {
          console.warn('[Krumer Reader] nao foi possivel restaurar a orientacao', error);
        });
      });
    };
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    void ScreenOrientation.lockAsync(lockForPreference(preference)).catch((error) => {
      console.warn('[Krumer Reader] nao foi possivel alterar a orientacao', error);
    });
  }, [preference]);

  return {
    height,
    isLandscape: width > height,
    width,
  };
}
