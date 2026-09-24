import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  checkAppUpdate,
  downloadAndInstallUpdate,
  UpdateInfo,
} from '../services/tauriUpdaterService';

export type UpdateStage = 'idle' | 'checking' | 'downloading' | 'installing' | 'complete' | 'error';

interface UpdaterProgress {
  downloaded: number;
  total: number | null;
  stage: UpdateStage;
  percent: number;
}

interface UpdaterContextValue {
  updateInfo: UpdateInfo | null;
  progress: UpdaterProgress;
  isDownloading: boolean;
  checkForUpdates: () => Promise<void>;
  startUpdate: () => Promise<void>;
  dismissUpdate: () => void;
}

const UpdaterContext = createContext<UpdaterContextValue>({
  updateInfo: null,
  progress: { downloaded: 0, total: null, stage: 'idle', percent: 0 },
  isDownloading: false,
  checkForUpdates: async () => {},
  startUpdate: async () => {},
  dismissUpdate: () => {},
});

interface UpdaterProviderProps {
  children: React.ReactNode;
}

export const UpdaterProvider: React.FC<UpdaterProviderProps> = ({ children }) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdaterProgress>({
    downloaded: 0,
    total: null,
    stage: 'idle',
    percent: 0,
  });
  const [isDownloading, setIsDownloading] = useState(false);

  // Listen for progress events from Rust backend
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async (): Promise<void> => {
      try {
        const unlisten = await listen<{ downloaded: number; total: number | null; stage: string }>(
          'updater://progress',
          (event) => {
            const { downloaded, total, stage } = event.payload;
            const percent =
              total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

            setProgress({
              downloaded,
              total,
              stage: stage as UpdateStage,
              percent,
            });

            if (stage === 'complete') {
              setIsDownloading(false);
              // App will restart automatically from Rust side
            } else if (stage === 'installing') {
              setProgress((prev) => ({ ...prev, percent: 100 }));
            }
          },
        );
        unlistenFn = unlisten;
      } catch (err) {
        // Silently handle event listener errors - update may not be available
        // eslint-disable-next-line no-console
        console.info('[UpdaterContext] Event listener setup failed (expected in dev/web):', err);
      }
    };

    void setupListener();

    return (): void => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  const checkForUpdates = useCallback(async (): Promise<void> => {
    setProgress((prev) => ({ ...prev, stage: 'checking' }));
    setUpdateInfo(null); // clear stale result on each new check
    try {
      const info = await checkAppUpdate();
      if (info.available) {
        setUpdateInfo(info);
      } else if (info.error) {
        // Normalise the raw tauri_plugin_updater error string into something
        // the user can act on.  The most common failure is a 404 when no
        // GitHub release has been published yet (draft releases return 404
        // from /releases/latest, which is the endpoint we poll).
        const raw = info.error;
        let friendly = raw;
        if (/404|not found|no release/i.test(raw)) {
          friendly = 'No published release found. The release may still be a draft on GitHub.';
        } else if (/network|connection|timeout|dns/i.test(raw)) {
          friendly = 'Network error — check your internet connection and try again.';
        } else if (/invalid.*json|parse|deserializ/i.test(raw)) {
          friendly = 'Update manifest is malformed. The release JSON could not be parsed.';
        }
        // eslint-disable-next-line no-console
        console.warn('[UpdaterContext] Update check error:', raw);
        setUpdateInfo({ available: false, error: friendly });
      } else {
        setUpdateInfo(null);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[UpdaterContext] Unexpected check failure:', err);
      setUpdateInfo({ available: false, error: 'Unexpected error while checking for updates.' });
    } finally {
      setProgress((prev) => ({ ...prev, stage: 'idle' }));
    }
  }, []);

  const startUpdate = useCallback(async (): Promise<void> => {
    if (!updateInfo?.available) return;

    setIsDownloading(true);
    setProgress({ downloaded: 0, total: null, stage: 'downloading', percent: 0 });

    try {
      await downloadAndInstallUpdate();
      // If we get here, the app didn't restart (shouldn't happen normally)
      setProgress((prev) => ({ ...prev, stage: 'complete', percent: 100 }));
      setIsDownloading(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[UpdaterContext] Download failed:', err);
      setProgress((prev) => ({ ...prev, stage: 'error' }));
      setIsDownloading(false);
    }
  }, [updateInfo]);

  const dismissUpdate = useCallback((): void => {
    setUpdateInfo(null);
    setProgress({ downloaded: 0, total: null, stage: 'idle', percent: 0 });
  }, []);

  return (
    <UpdaterContext.Provider
      value={{
        updateInfo,
        progress,
        isDownloading,
        checkForUpdates,
        startUpdate,
        dismissUpdate,
      }}
    >
      {children}
    </UpdaterContext.Provider>
  );
};

export const useUpdater = (): UpdaterContextValue => useContext(UpdaterContext);
