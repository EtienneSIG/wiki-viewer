import { useCallback, useEffect, useState } from 'react';
import { APP_LICENSE, APP_VERSION, RELEASES_URL, checkForUpdate, type UpdateInfo } from '../../lib/version';
import { t } from '../../lib/i18n';

const LICENSE_URL = `${RELEASES_URL.replace(/\/releases$/, '')}/blob/main/LICENSE`;

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'update' | 'error';

/**
 * Fixed badge in the bottom-right corner showing the license and app version,
 * with an on-demand "check for updates" affordance. Automatically runs a
 * cached check once on mount.
 */
export function StatusBar(): JSX.Element {
  const [state, setState] = useState<CheckState>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  const runCheck = useCallback(async (force: boolean): Promise<void> => {
    setState('checking');
    const result = await checkForUpdate(force);
    if (!result) {
      setState('error');
      return;
    }
    setInfo(result);
    setState(result.hasUpdate ? 'update' : 'up-to-date');
  }, []);

  // Silent, cached check on first render.
  useEffect(() => {
    void (async () => {
      const result = await checkForUpdate(false);
      if (result) {
        setInfo(result);
        if (result.hasUpdate) setState('update');
      }
    })();
  }, []);

  return (
    <footer className="wv-statusbar" aria-label={t('status.appInfo')}>
      <a
        className="wv-statusbar-item wv-license"
        href={LICENSE_URL}
        target="_blank"
        rel="noreferrer noopener"
        title={t('status.license', { license: APP_LICENSE })}
      >
        {APP_LICENSE}
      </a>
      <span className="wv-statusbar-sep" aria-hidden="true">·</span>
      <span className="wv-statusbar-item wv-version" title={`Version ${APP_VERSION}`}>
        v{APP_VERSION}
      </span>

      {state === 'update' && info ? (
        <a
          className="wv-statusbar-item wv-update-available"
          href={info.url}
          target="_blank"
          rel="noreferrer noopener"
          title={t('update.availableTitle', { version: info.latest })}
        >
          <span className="wv-update-dot" aria-hidden="true" />
          {t('update.badge', { version: info.latest })}
        </a>
      ) : (
        <button
          type="button"
          className="wv-statusbar-item wv-update-check"
          onClick={() => void runCheck(true)}
          disabled={state === 'checking'}
          title={t('update.check')}
        >
          {state === 'checking'
            ? t('update.checking')
            : state === 'up-to-date'
              ? t('update.upToDate')
              : state === 'error'
                ? t('update.unavailable')
                : t('update.check')}
        </button>
      )}
    </footer>
  );
}
