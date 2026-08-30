import { useCallback } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../context/AppContext';

/**
 * Refreshes the local library after a screen transition has settled.
 * The context serializes requests, so changing tabs quickly cannot start
 * overlapping scans or replace the cached library with an older result.
 */
export function useAutoRescan() {
  const { rescanLibrary } = useApp();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const interaction = InteractionManager.runAfterInteractions(() => {
        if (active) void rescanLibrary();
      });

      return () => {
        active = false;
        interaction.cancel();
      };
    }, [rescanLibrary]),
  );
}
