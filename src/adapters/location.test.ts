import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchLocation } from './location';

afterEach(() => vi.unstubAllGlobals());

function stubGeo() {
  const geo = {
    watchPosition: vi.fn().mockReturnValue(7),
    clearWatch: vi.fn(),
  };
  vi.stubGlobal('navigator', { geolocation: geo });
  return geo;
}

describe('watchLocation', () => {
  it('forwards positions and reports granted', () => {
    const geo = stubGeo();
    const onPos = vi.fn();
    const onStatus = vi.fn();
    watchLocation(onPos, onStatus);
    expect(geo.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
    geo.watchPosition.mock.calls[0][0]({
      coords: { latitude: 40.4, longitude: -3.7, accuracy: 12 },
    });
    expect(onStatus).toHaveBeenCalledWith('granted');
    expect(onPos).toHaveBeenCalledWith({ point: { lat: 40.4, lng: -3.7 }, accuracyM: 12 });
  });

  it('maps code 1 to denied and others to unavailable', () => {
    const geo = stubGeo();
    const onStatus = vi.fn();
    watchLocation(vi.fn(), onStatus);
    geo.watchPosition.mock.calls[0][1]({ code: 1 });
    geo.watchPosition.mock.calls[0][1]({ code: 2 });
    expect(onStatus).toHaveBeenNthCalledWith(1, 'denied');
    expect(onStatus).toHaveBeenNthCalledWith(2, 'unavailable');
  });

  it('stop calls clearWatch', () => {
    const geo = stubGeo();
    const stop = watchLocation(vi.fn(), vi.fn());
    stop();
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
  });

  it('reports unavailable when geolocation is missing', () => {
    vi.stubGlobal('navigator', {});
    const onStatus = vi.fn();
    const stop = watchLocation(vi.fn(), onStatus);
    expect(onStatus).toHaveBeenCalledWith('unavailable');
    expect(() => stop()).not.toThrow();
  });
});
