/**
 * Region name -> short code for the countries whose geocoder results give
 * only the full name (Photon returns "Massachusetts"; Nominatim also returns
 * the ISO 3166-2 code). The region stat counts `regionCode`, so a stop picked
 * with Photon and one picked with Nominatim count as the same region.
 * Incomplete on purpose: elsewhere the region keeps its name.
 */
const REGION_CODES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  US: {
    alabama: 'AL',
    alaska: 'AK',
    arizona: 'AZ',
    arkansas: 'AR',
    california: 'CA',
    colorado: 'CO',
    connecticut: 'CT',
    delaware: 'DE',
    'district of columbia': 'DC',
    florida: 'FL',
    georgia: 'GA',
    hawaii: 'HI',
    idaho: 'ID',
    illinois: 'IL',
    indiana: 'IN',
    iowa: 'IA',
    kansas: 'KS',
    kentucky: 'KY',
    louisiana: 'LA',
    maine: 'ME',
    maryland: 'MD',
    massachusetts: 'MA',
    michigan: 'MI',
    minnesota: 'MN',
    mississippi: 'MS',
    missouri: 'MO',
    montana: 'MT',
    nebraska: 'NE',
    nevada: 'NV',
    'new hampshire': 'NH',
    'new jersey': 'NJ',
    'new mexico': 'NM',
    'new york': 'NY',
    'north carolina': 'NC',
    'north dakota': 'ND',
    ohio: 'OH',
    oklahoma: 'OK',
    oregon: 'OR',
    pennsylvania: 'PA',
    'rhode island': 'RI',
    'south carolina': 'SC',
    'south dakota': 'SD',
    tennessee: 'TN',
    texas: 'TX',
    utah: 'UT',
    vermont: 'VT',
    virginia: 'VA',
    washington: 'WA',
    'west virginia': 'WV',
    wisconsin: 'WI',
    wyoming: 'WY',
    'puerto rico': 'PR',
  },
  CA: {
    alberta: 'AB',
    'british columbia': 'BC',
    manitoba: 'MB',
    'new brunswick': 'NB',
    'newfoundland and labrador': 'NL',
    'northwest territories': 'NT',
    'nova scotia': 'NS',
    nunavut: 'NU',
    ontario: 'ON',
    'prince edward island': 'PE',
    quebec: 'QC',
    saskatchewan: 'SK',
    yukon: 'YT',
  },
  AU: {
    'australian capital territory': 'ACT',
    'new south wales': 'NSW',
    'northern territory': 'NT',
    queensland: 'QLD',
    'south australia': 'SA',
    tasmania: 'TAS',
    victoria: 'VIC',
    'western australia': 'WA',
  },
};

/** Short code of region `name` in country `country` (ISO alpha-2), or undefined. */
export function regionShortCode(
  country: string | undefined,
  name: string | undefined,
): string | undefined {
  if (country === undefined || name === undefined) return undefined;
  const table = REGION_CODES[country.toUpperCase()];
  const key = name.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase();
  return table?.[key];
}
