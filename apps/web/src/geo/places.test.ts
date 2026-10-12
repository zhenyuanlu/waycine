import { describe, expect, it } from 'vitest';
import { placesFromNominatim, placesFromPhoton } from './places';

describe('geocoder replies', () => {
  it('reads Photon features with a region code from the state name', () => {
    const places = placesFromPhoton({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-71.0588801, 42.3600825] },
          properties: {
            name: 'Boston',
            state: 'Massachusetts',
            country: 'United States',
            countrycode: 'us',
            osm_key: 'place',
            osm_value: 'city',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
          properties: {
            name: 'Paris',
            state: 'Ile-de-France',
            country: 'France',
            countrycode: 'FR',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: ['x', 1] },
          properties: { name: 'Bad' },
        },
        { junk: true },
      ],
    });
    expect(places).toEqual([
      {
        label: 'Boston, Massachusetts, United States',
        name: 'Boston',
        lat: 42.3600825,
        lon: -71.0588801,
        region: 'MA',
        regionCode: 'US-MA',
        country: 'US',
        source: 'photon',
      },
      {
        label: 'Paris, Ile-de-France, France',
        name: 'Paris',
        lat: 48.8566,
        lon: 2.3522,
        region: 'Ile-de-France',
        country: 'FR',
        source: 'photon',
      },
    ]);
    expect(placesFromPhoton(null)).toEqual([]);
  });

  it('reads Nominatim results with their ISO 3166-2 code', () => {
    const places = placesFromNominatim([
      {
        lat: '42.3554334',
        lon: '-71.060511',
        name: 'Boston',
        display_name: 'Boston, Suffolk County, Massachusetts, United States',
        address: {
          city: 'Boston',
          county: 'Suffolk County',
          state: 'Massachusetts',
          'ISO3166-2-lvl4': 'US-MA',
          country: 'United States',
          country_code: 'us',
        },
      },
      { lat: 'nope', lon: '1' },
    ]);
    expect(places).toEqual([
      {
        label: 'Boston, Suffolk County, Massachusetts, United States',
        name: 'Boston',
        lat: 42.3554334,
        lon: -71.060511,
        region: 'MA',
        regionCode: 'US-MA',
        country: 'US',
        source: 'nominatim',
      },
    ]);
    expect(placesFromNominatim({ error: 'x' })).toEqual([]);
  });
});
