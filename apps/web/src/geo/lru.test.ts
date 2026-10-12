import { describe, expect, it } from 'vitest';
import { type KeyValueStorage, LruCache } from './lru';

interface TestStorage extends KeyValueStorage {
  data: Map<string, string>;
  failWrites: boolean;
}

function memoryStorage(): TestStorage {
  const data = new Map<string, string>();
  const storage: TestStorage = {
    data,
    failWrites: false,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (storage.failWrites) throw new DOMException('full', 'QuotaExceededError');
      data.set(key, value);
    },
  };
  return storage;
}

describe('LruCache', () => {
  it('drops the least recently used entry beyond capacity', () => {
    const cache = new LruCache<number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1); // a is now the newest
    cache.set('d', 4);
    expect(cache.has('b')).toBe(false);
    expect(cache.keys()).toEqual(['c', 'a', 'd']);
    cache.set('c', 30); // an update makes it the newest too
    cache.set('e', 5);
    expect(cache.keys()).toEqual(['d', 'c', 'e']);
    expect(cache.size).toBe(3);
  });

  it('keeps 500 entries in the app configuration', () => {
    const cache = new LruCache<number>(500);
    for (let i = 0; i < 600; i++) cache.set(`k${i}`, i);
    expect(cache.size).toBe(500);
    expect(cache.has('k99')).toBe(false);
    expect(cache.has('k100')).toBe(true);
  });

  it('persists to storage on set and loads it back in order; a get writes nothing', () => {
    const storage = memoryStorage();
    const first = new LruCache<string[]>(3, storage, 'geo');
    first.set('photon|boston', ['Boston']);
    first.set('photon|paris', ['Paris']);
    const written = storage.data.get('geo');
    first.get('photon|boston');
    expect(storage.data.get('geo')).toBe(written);
    expect(first.keys()).toEqual(['photon|paris', 'photon|boston']);
    // The next set saves the order the gets made.
    first.set('photon|rome', ['Rome']);
    const second = new LruCache<string[]>(3, storage, 'geo');
    expect(second.keys()).toEqual(['photon|paris', 'photon|boston', 'photon|rome']);
    expect(second.get('photon|boston')).toEqual(['Boston']);
    second.clear();
    expect(new LruCache<string[]>(3, storage, 'geo').size).toBe(0);
  });

  it('survives corrupt storage and failing writes', () => {
    const storage = memoryStorage();
    storage.data.set('geo', '{not json');
    const cache = new LruCache<number>(5, storage, 'geo');
    expect(cache.size).toBe(0);
    storage.failWrites = true;
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    storage.data.set('geo2', JSON.stringify([['x', 1], 'junk', [2, 3], ['y', 2]]));
    expect(new LruCache<number>(5, storage, 'geo2').keys()).toEqual(['x', 'y']);
  });
});
