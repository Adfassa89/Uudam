import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from './downloader';

/** Saved offline areas and the id of the one downloading right now (if any). */
export function useOfflineAreas() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
