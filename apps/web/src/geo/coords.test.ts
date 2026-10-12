import { describe, expect, it } from 'vitest';
import { formatCoordinates, parseCoordinates } from './coords';

// Degree sign and prime, built from char codes so this file stays ASCII.
const DEG = String.fromCharCode(0xb0);
const PRIME = String.fromCharCode(0x2032);

function coords(text: string): [number, number] {
  const r = parseCoordinates(text);
  if (r?.kind !== 'coords') throw new Error(`${text}: ${JSON.stringify(r)}`);
  return [r.lat, r.lon];
}

describe('parseCoordinates', () => {
  it('reads decimal pairs, latitude first', () => {
    expect(coords('42.369, -71.121')).toEqual([42.369, -71.121]);
    expect(coords('  42.369 -71.121 ')).toEqual([42.369, -71.121]);
    expect(coords('42.369;-71.121')).toEqual([42.369, -71.121]);
    expect(coords('-33.8688,151.2093')).toEqual([-33.8688, 151.2093]);
    expect(coords('+10, +20')).toEqual([10, 20]);
  });

  it('reads hemisphere letters before or after, in either order', () => {
    expect(coords('42.369 N, 71.121 W')).toEqual([42.369, -71.121]);
    expect(coords('N 42.369 W 71.121')).toEqual([42.369, -71.121]);
    expect(coords('33.8688S 151.2093E')).toEqual([-33.8688, 151.2093]);
    expect(coords('71.121 W, 42.369 N')).toEqual([42.369, -71.121]);
    expect(coords('42.369n 71.121w')).toEqual([42.369, -71.121]);
  });

  it('reads degrees, minutes and seconds', () => {
    const [lat, lon] = coords(`42${DEG}22'8.4"N 71${DEG}7'15.6"W`);
    expect(lat).toBeCloseTo(42 + 22 / 60 + 8.4 / 3600, 10);
    expect(lon).toBeCloseTo(-(71 + 7 / 60 + 15.6 / 3600), 10);
    const [lat2, lon2] = coords('40 26 46 N 79 58 56 W');
    expect(lat2).toBeCloseTo(40.446111, 5);
    expect(lon2).toBeCloseTo(-79.982222, 5);
    const [lat3, lon3] = coords(`51${DEG} 30${PRIME} N, 0${DEG} 7${PRIME} W`);
    expect(lat3).toBeCloseTo(51.5, 10);
    expect(lon3).toBeCloseTo(-7 / 60, 10);
    expect(coords('40d26m46s N 79d58m56s W')[0]).toBeCloseTo(40.446111, 5);
  });

  it('reads Google Maps links: the place (!3d!4d) before the view (@)', () => {
    expect(
      coords(
        'https://www.google.com/maps/place/Boston/@42.3140089,-71.2504676,11z/data=!3m1!4b1!4m6!3m5!1s0x89e3652d0d3d311b:0x787cbf240162e8a0!8m2!3d42.3600825!4d-71.0588801',
      ),
    ).toEqual([42.3600825, -71.0588801]);
    expect(coords('https://www.google.com/maps/@40.7127753,-74.0059728,12z')).toEqual([
      40.7127753, -74.0059728,
    ]);
  });

  it('never treats a link or a place name as coordinates', () => {
    expect(parseCoordinates('https://maps.app.goo.gl/abcdEFGH')).toEqual({
      kind: 'error',
      error: 'link',
    });
    expect(parseCoordinates('www.example.com/somewhere')).toEqual({ kind: 'error', error: 'link' });
    expect(parseCoordinates('Boston')).toBeNull();
    expect(parseCoordinates('New York 10001')).toBeNull();
    expect(parseCoordinates('10 Downing Street')).toBeNull();
    expect(parseCoordinates('')).toBeNull();
  });

  it('reports values out of range', () => {
    expect(parseCoordinates('95, 10')).toEqual({ kind: 'error', error: 'latitude' });
    expect(parseCoordinates('10, 190')).toEqual({ kind: 'error', error: 'longitude' });
    expect(parseCoordinates('89, 10')).toEqual({ kind: 'error', error: 'mercator' });
    expect(parseCoordinates('89 N 10 E')).toEqual({ kind: 'error', error: 'mercator' });
  });

  it('formats with five decimals', () => {
    expect(formatCoordinates(42.369, -71.121)).toBe('42.36900, -71.12100');
  });
});
