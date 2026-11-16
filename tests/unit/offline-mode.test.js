import { describe, it, expect, beforeEach } from 'vitest';
import { createMockLocalStorage } from '../utils/test-helpers.js';

// Shadow tests for the "fully offline mode" feature - mirrors the real implementation
// in cache-manager.js (durable offline store) and app.js (isEffectivelyOffline(),
// reconcileOnReconnect()) rather than importing those modules directly, matching this
// repo's established convention (app.js/cache-manager.js self-instantiate as globals
// on page load, not ES modules - see tests/unit/data-persistence.test.js for the same
// pattern).

describe('Durable offline store', () => {
  let localStorage;
  const cachePrefix = 'workout_tracker_';
  const cacheVersion = '1.0';
  const cacheExpiry = { sessions: 5 * 60 * 1000, exercises: 30 * 60 * 1000, plans: 30 * 60 * 1000 };

  // Mirrors CacheManager.getOfflineKey/getOfflineData/setOfflineData/markOfflineSynced
  const getOfflineKey = (type) => `${cachePrefix}offline_${type}`;
  const getOfflineData = (type) => {
    const raw = localStorage.getItem(getOfflineKey(type));
    return raw ? JSON.parse(raw) : null;
  };
  const setOfflineData = (type, value, { touchLocal = true, touchSynced = false } = {}) => {
    const existing = getOfflineData(type) || {};
    const now = Date.now();
    let lastLocalModifiedAt = touchLocal ? now : (existing.lastLocalModifiedAt ?? null);
    const lastSyncedAt = touchSynced ? now : (existing.lastSyncedAt ?? null);
    // Force a strict tie-break: Date.now() only has millisecond resolution, so a
    // "just synced" write immediately followed by a "local edit" write can land on
    // the same tick - without this, the dirty check downstream (`> lastSyncedAt`)
    // would wrongly treat a genuinely-changed dataset as clean.
    if (touchLocal && !touchSynced && lastSyncedAt != null && lastLocalModifiedAt <= lastSyncedAt) {
      lastLocalModifiedAt = lastSyncedAt + 1;
    }
    const record = { value, version: cacheVersion, lastLocalModifiedAt, lastSyncedAt };
    localStorage.setItem(getOfflineKey(type), JSON.stringify(record));
  };
  const markOfflineSynced = (type) => {
    const existing = getOfflineData(type);
    if (!existing) return;
    existing.lastSyncedAt = Date.now();
    localStorage.setItem(getOfflineKey(type), JSON.stringify(existing));
  };

  // Mirrors CacheManager.getCachedData, for contrast against the durable store
  const getCachedData = (type, now = Date.now()) => {
    const key = `${cachePrefix}${cacheVersion}_${type}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.timestamp && (now - data.timestamp) > cacheExpiry[type]) return null;
    return data.value;
  };
  const setCachedData = (type, value, now = Date.now()) => {
    const key = `${cachePrefix}${cacheVersion}_${type}`;
    localStorage.setItem(key, JSON.stringify({ value, timestamp: now, version: cacheVersion }));
  };

  beforeEach(() => {
    localStorage = createMockLocalStorage();
  });

  it('should round-trip a value with lastLocalModifiedAt/lastSyncedAt metadata', () => {
    setOfflineData('sessions', [{ date: '2026-11-16', exercises: [] }], { touchLocal: true, touchSynced: true });
    const record = getOfflineData('sessions');

    expect(record.value).toEqual([{ date: '2026-11-16', exercises: [] }]);
    expect(record.lastLocalModifiedAt).toBeTypeOf('number');
    expect(record.lastSyncedAt).toBeTypeOf('number');
  });

  it('should never expire, unlike the TTL cache', () => {
    const now = Date.now();
    setOfflineData('sessions', ['offline data'], { touchLocal: true, touchSynced: true });
    setCachedData('sessions', ['ttl-cached data'], now);

    // Fast-forward well past the real 5-minute sessions TTL
    const muchLater = now + 10 * 60 * 60 * 1000; // 10 hours

    expect(getOfflineData('sessions').value).toEqual(['offline data']);
    expect(getCachedData('sessions', muchLater)).toBeNull(); // contrast: the TTL cache *does* expire
  });

  it('should leave lastSyncedAt untouched on a plain local edit (touchSynced: false)', () => {
    setOfflineData('exercises', ['a'], { touchLocal: true, touchSynced: true });
    const synced = getOfflineData('exercises').lastSyncedAt;

    setOfflineData('exercises', ['a', 'b'], { touchLocal: true, touchSynced: false });
    const record = getOfflineData('exercises');

    expect(record.value).toEqual(['a', 'b']);
    expect(record.lastSyncedAt).toBe(synced); // unchanged - still looks dirty
  });

  it('should advance lastSyncedAt without changing the value via markOfflineSynced', () => {
    setOfflineData('plans', ['plan-a'], { touchLocal: true, touchSynced: false });
    const before = getOfflineData('plans');
    expect(before.lastSyncedAt).toBeNull();

    markOfflineSynced('plans');
    const after = getOfflineData('plans');

    expect(after.value).toEqual(['plan-a']);
    expect(after.lastSyncedAt).toBeTypeOf('number');
  });

  it('should return null for a dataset that was never written', () => {
    expect(getOfflineData('sessions')).toBeNull();
  });

  it('should force lastLocalModifiedAt strictly past lastSyncedAt even on the same millisecond', () => {
    // Regression coverage: Date.now() only has millisecond resolution, so a "just
    // synced" write immediately followed by a "local edit" write can land on the
    // exact same tick. Without correcting for the tie, reconcileOnReconnect()'s
    // `lastLocalModifiedAt > lastSyncedAt` dirty check would wrongly see a
    // genuinely-changed dataset as clean and silently skip pushing it on reconnect.
    const fixedNow = 1_700_000_000_000;
    const originalDateNow = Date.now;
    Date.now = () => fixedNow; // Pin the clock so both writes tie exactly

    try {
      setOfflineData('sessions', ['synced'], { touchLocal: true, touchSynced: true });
      setOfflineData('sessions', ['edited while offline'], { touchLocal: true, touchSynced: false });
    } finally {
      Date.now = originalDateNow;
    }

    const record = getOfflineData('sessions');
    expect(record.lastSyncedAt).toBe(fixedNow);
    expect(record.lastLocalModifiedAt).toBeGreaterThan(record.lastSyncedAt);
  });

  describe('clearOldCache() must skip the offline store', () => {
    // Regression coverage: clearOldCache()'s TTL sweep iterates every
    // cachePrefix-prefixed key and treats a missing `timestamp` field as a corrupted
    // entry to delete. The offline store's records have no `timestamp` by design (they
    // never expire) - without an explicit skip, every offline-mode record would be
    // silently wiped the next time this sweep runs.

    const sweepWithoutFix = (keys) => {
      // Mirrors the ORIGINAL clearOldCache() body, with no offline-key skip
      const now = Date.now();
      const maxExpiry = Math.max(...Object.values(cacheExpiry));
      keys.forEach((key) => {
        if (!key.startsWith(cachePrefix)) return;
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (!data.timestamp || data.version !== cacheVersion || (now - data.timestamp) > maxExpiry) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          localStorage.removeItem(key);
        }
      });
    };

    const sweepWithFix = (keys) => {
      // Mirrors the FIXED clearOldCache() body
      const now = Date.now();
      const maxExpiry = Math.max(...Object.values(cacheExpiry));
      keys.forEach((key) => {
        if (!key.startsWith(cachePrefix)) return;
        if (key.includes('_offline_')) return;
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (!data.timestamp || data.version !== cacheVersion || (now - data.timestamp) > maxExpiry) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          localStorage.removeItem(key);
        }
      });
    };

    it('would have wiped an offline record (pre-fix behavior)', () => {
      setOfflineData('sessions', ['precious offline data'], { touchLocal: true, touchSynced: true });
      sweepWithoutFix([getOfflineKey('sessions')]);

      expect(getOfflineData('sessions')).toBeNull();
    });

    it('leaves the offline record intact (fixed behavior)', () => {
      setOfflineData('sessions', ['precious offline data'], { touchLocal: true, touchSynced: true });
      sweepWithFix([getOfflineKey('sessions')]);

      expect(getOfflineData('sessions').value).toEqual(['precious offline data']);
    });
  });
});

describe('isEffectivelyOffline()', () => {
  // Mirrors the new WorkoutTracker.isEffectivelyOffline() helper
  const isEffectivelyOffline = (offlineModeEnabled, cacheManagerIsOnline) =>
    offlineModeEnabled || !cacheManagerIsOnline;

  it('should be false when the switch is off and the browser reports online', () => {
    expect(isEffectivelyOffline(false, true)).toBe(false);
  });

  it('should be true when the switch is explicitly on, even if nominally online', () => {
    expect(isEffectivelyOffline(true, true)).toBe(true);
  });

  it('should be true when the switch is off but the browser reports offline (auto-fallback)', () => {
    expect(isEffectivelyOffline(false, false)).toBe(true);
  });

  it('should be true when both the switch is on and the browser reports offline', () => {
    expect(isEffectivelyOffline(true, false)).toBe(true);
  });
});

describe('reconcileOnReconnect() decision matrix', () => {
  // Mirrors the per-dataset decision logic in the new reconcileOnReconnect()
  const decide = (local, remoteModifiedAt) => {
    const lastSyncedAt = local.lastSyncedAt ?? 0;
    const localDirty = local.lastLocalModifiedAt > lastSyncedAt;
    const remoteDirty = remoteModifiedAt > lastSyncedAt;

    if (!localDirty && !remoteDirty) return 'no-op';
    if (localDirty && !remoteDirty) return 'push';
    if (!localDirty && remoteDirty) return 'pull';
    // Both dirty - genuine conflict. Per the user's explicit choice: fully automatic
    // newest-wins, no prompt, applied uniformly (not just to some datasets).
    return local.lastLocalModifiedAt >= remoteModifiedAt ? 'push' : 'pull';
  };

  it('should no-op when neither side changed since the last sync', () => {
    const local = { lastLocalModifiedAt: 100, lastSyncedAt: 200 };
    expect(decide(local, 150)).toBe('no-op');
  });

  it('should push when only local changed', () => {
    const local = { lastLocalModifiedAt: 300, lastSyncedAt: 200 };
    expect(decide(local, 150)).toBe('push');
  });

  it('should pull when only the remote sheet changed', () => {
    const local = { lastLocalModifiedAt: 100, lastSyncedAt: 200 };
    expect(decide(local, 250)).toBe('pull');
  });

  it('should pick the newer side automatically on a genuine conflict (local newer)', () => {
    const local = { lastLocalModifiedAt: 500, lastSyncedAt: 200 };
    expect(decide(local, 400)).toBe('push'); // local change (500) is newer than remote (400)
  });

  it('should pick the newer side automatically on a genuine conflict (remote newer)', () => {
    const local = { lastLocalModifiedAt: 300, lastSyncedAt: 200 };
    expect(decide(local, 450)).toBe('pull'); // remote change (450) is newer than local (300)
  });

  it('should treat a never-before-synced dataset as always remote-dirty, forcing a baseline pull', () => {
    const local = { lastLocalModifiedAt: null, lastSyncedAt: null };
    // lastLocalModifiedAt is null -> localDirty is false (null > 0 is false)
    // remoteModifiedAt is any real timestamp -> remoteDirty is true (anything > 0)
    expect(decide(local, Date.now())).toBe('pull');
  });
});
