import { describe, expect, it } from 'vitest';
import { buildNavigationUrl } from './handoff';

const madrid = { lat: 40.4168, lng: -3.7038 };

describe('buildNavigationUrl', () => {
  it('builds a Google Maps directions URL', () => {
    expect(buildNavigationUrl('google', madrid)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.4168,-3.7038',
    );
  });
  it('builds a Waze navigation URL', () => {
    expect(buildNavigationUrl('waze', madrid)).toBe(
      'https://waze.com/ul?ll=40.4168,-3.7038&navigate=yes',
    );
  });
});
