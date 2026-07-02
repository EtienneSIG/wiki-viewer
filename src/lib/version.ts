/**
 * App version metadata and update checking.
 *
 * The current version and license are injected at build time from
 * `package.json` (see `vite.config.ts`). Update checks query the public GitHub
 * Releases API for the project repository — no auth, no data leaves except the
 * anonymous GET request to GitHub. Results are cached briefly in localStorage
 * to avoid hammering the API on every launch (GitHub rate-limits anonymous
 * requests to 60/hour per IP).
 */

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const APP_LICENSE: string = typeof __APP_LICENSE__ !== 'undefined' ? __APP_LICENSE__ : 'MIT';

/** GitHub `owner/repo` used for release lookups and the releases page link. */
const REPO = 'EtienneSIG/wiki-viewer';
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

const CACHE_KEY = 'wv-update-check';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface UpdateInfo {
  /** The version currently running. */
  current: string;
  /** The latest published version on GitHub (without a leading `v`). */
  latest: string;
  /** True when `latest` is strictly newer than `current`. */
  hasUpdate: boolean;
  /** Link to the release (or the releases page as a fallback). */
  url: string;
}

/** Parse a semver-ish string into comparable numeric parts (ignores pre-release). */
function parseVersion(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Returns true when `latest` is strictly greater than `current`. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function readCache(): UpdateInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; info: UpdateInfo };
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    // Re-evaluate against the running version in case the app was updated.
    return { ...parsed.info, current: APP_VERSION, hasUpdate: isNewer(parsed.info.latest, APP_VERSION) };
  } catch {
    return null;
  }
}

function writeCache(info: UpdateInfo): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), info }));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/**
 * Check GitHub for a newer release. Returns `null` when the check fails (e.g.
 * offline or rate-limited). Set `force` to bypass the local cache.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }

  try {
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; name?: string; html_url?: string };
    const tag = (data.tag_name ?? data.name ?? '').trim();
    if (!tag) return null;
    const latest = tag.replace(/^v/i, '');
    const info: UpdateInfo = {
      current: APP_VERSION,
      latest,
      hasUpdate: isNewer(latest, APP_VERSION),
      url: data.html_url ?? RELEASES_URL,
    };
    writeCache(info);
    return info;
  } catch {
    return null;
  }
}
