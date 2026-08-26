import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export function useOrientation() {
  const { height, width } = useWindowDimensions();

  useEffect(() => {
    let cancelled = false;
    let didUnlock = false;
    let previousLock: ScreenOrientation.OrientationLock = ScreenOrientation.OrientationLock.PORTRAIT_UP;

    const unlock = ScreenOrientation.getOrientationLockAsync()
      .then((lock) => {
        previousLock = lock === ScreenOrientation.OrientationLock.PORTRAIT
          || lock === ScreenOrientation.OrientationLock.PORTRAIT_UP
          ? lock
          : ScreenOrientation.OrientationLock.PORTRAIT_UP;
        if (cancelled) return;
        return ScreenOrientation.unlockAsync().then(() => {
          didUnlock = true;
        });
      })
      .catch((error) => {
        console.warn('[Krumer Reader] nao foi possivel liberar a orientacao', error);
      });

    return () => {
      cancelled = true;
      void unlock.then(() => {
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
