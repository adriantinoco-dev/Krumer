import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export function usePortraitOrientation() {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .catch((error) => {
        console.warn('[Krumer] nao foi possivel bloquear a orientacao vertical', error);
      });
  }, []);
}

export function useOrientation() {
  const { height, width } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    let didUnlock = false;
    let previousLock: ScreenOrientation.OrientationLock = ScreenOrientation.OrientationLock.PORTRAIT_UP;

    const allowReaderOrientations = ScreenOrientation.getOrientationLockAsync()
      .then((lock) => {
        previousLock = lock === ScreenOrientation.OrientationLock.PORTRAIT
          || lock === ScreenOrientation.OrientationLock.PORTRAIT_UP
          ? lock
          : ScreenOrientation.OrientationLock.PORTRAIT_UP;
        if (cancelled) return;
        return ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL).then(() => {
          didUnlock = true;
        });
      })
      .catch((error) => {
        console.warn('[Krumer Reader] nao foi possivel liberar a orientacao', error);
      });

    return () => {
      cancelled = true;
      void allowReaderOrientations.then(() => {
        if (!didUnlock) return;
        return ScreenOrientation.lockAsync(previousLock).catch((error) => {
          console.warn('[Krumer Reader] nao foi possivel restaurar a orientacao', error);
        });
      });
    };
  }, []);

  return {
    height,
    isLandscape: width > height,
    width,
  };
}
