import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Position } from '../adapters/location';
import { madridConfig } from '../cities/madrid/config';
import type { LatLng, Settings } from '../core/types';
import { useI18n } from '../i18n';
import { createLongPress } from './longPress';
import type { PressPoint } from './longPress';
import { METERS_COLOR } from './mapColors';
import { boundsForPoints } from './mapFit';
import { FALLBACK_STYLE, resolveStyle } from './mapStyle';
import { stretchesToGeoJson } from './mapLayers';
import type { ZoneData } from './useZoneData';

export interface MapViewProps {
  data: ZoneData;
  settings: Settings;
  position: Position | null;
  tried: string[];
  highlightedZoneId: string | null;
  onLongPress: (p: LatLng) => void;
  recenterSignal: number;
  fitTo?: { id: string; points: LatLng[] } | null;
  /** Where to draw the red destination pin; null/omitted for none. */
  destinationPin?: LatLng | null;
}

// Vite does not emit MapLibre's worker file on its own (the default URL is
// import.meta-relative and 404s in the production build), so bundle it explicitly.
setWorkerUrl(maplibreWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const LONG_PRESS_MS = 600;
const LONG_PRESS_SLOP_PX = 10;
const FOLLOW_ZOOM = 16;
const HIGHLIGHT_ZOOM = 16;
const PIN_COLOR = '#d32f2f';
const TRIED_COLOR = '#9e9e9e';
const CLUSTER_MAX_ZOOM = 14;
const BARRIOS_URL = new URL(
  `${import.meta.env.BASE_URL}data/madrid/barrios.geojson`,
  window.location.href,
).href;
const METERS_URL = new URL(
  `${import.meta.env.BASE_URL}data/madrid/parquimetros.geojson`,
  window.location.href,
).href;
// Clusters break up above CLUSTER_MAX_ZOOM, so this is where single spots appear.
const METERS_MIN_ZOOM = CLUSTER_MAX_ZOOM + 1;

// One clustered GeoJSON source per kind, so every cluster bubble is single
// coloured and blue/green are styled by the exact same expressions.
const KINDS = ['visitor', 'resident'] as const;
// Layer stack order, bottom to top: blue (visitor) is added last so it is never buried.
const STACK_ORDER = ['resident', 'visitor'] as const;
type Kind = (typeof KINDS)[number];
const sourceId = (k: Kind) => `zones-${k}`;

// Equal visibility: the same radius/opacity expressions are used for both kinds.
const POINT_RADIUS = 7;
const POINT_OPACITY = 0.9;
const CLUSTER_RADIUS: ExpressionSpecification = [
  'step',
  ['get', 'point_count'],
  14,
  10,
  18,
  50,
  23,
];

/** Pixel radius of `metres` at a given zoom/latitude (MapLibre 512px tiles). */
function metresToPixels(metres: number, lat: number, zoom: number): number {
  const mpp = (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return metres / mpp;
}

function accuracyRadius(metres: number, lat: number): ExpressionSpecification {
  // Pixel radius doubles per zoom level, so an exponential(2) interpolation
  // between two zooms is exact.
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    0,
    metresToPixels(metres, lat, 0),
    22,
    metresToPixels(metres, lat, 22),
  ];
}

export default function MapView({
  data,
  settings,
  position,
  tried,
  highlightedZoneId,
  onLongPress,
  recenterSignal,
  fitTo = null,
  destinationPin = null,
}: MapViewProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const followingRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(true);
  const onLongPressRef = useRef(onLongPress);
  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const setFollow = (on: boolean) => {
    followingRef.current = on;
    setFollowing(on);
  };

  const stretchIdsByZone = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of data.candidates) m.set(c.id, c.stretchIds);
    return m;
  }, [data.candidates]);

  const triedStretchIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of tried) for (const sid of stretchIdsByZone.get(id) ?? []) s.add(sid);
    return s;
  }, [tried, stretchIdsByZone]);

  const highlightedStretchIds = useMemo(
    () => new Set(highlightedZoneId ? (stretchIdsByZone.get(highlightedZoneId) ?? []) : []),
    [highlightedZoneId, stretchIdsByZone],
  );

  // Create the map once; destroy on cleanup (StrictMode safe).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void resolveStyle(STYLE_URL).then(({ style, fallback }) => {
      if (!cancelled) cleanup = init(container, style, fallback);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };

    function init(container: HTMLDivElement, style: string | object, startFallback: boolean) {
      // Fallback mode (blank style): no glyphs, so label layers are skipped.
      let fallbackMode = startFallback;
      let setupDone = false;
      const map = new MapLibreMap({
        container,
        style: style as string,
        center: [madridConfig.center.lng, madridConfig.center.lat],
        zoom: 13,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      // Test-only debug hook; exposed solely when the URL carries ?e2e.
      if (new URLSearchParams(window.location.search).has('e2e')) {
        (window as unknown as { __bzaMap?: MapLibreMap }).__bzaMap = map;
      }

      const setup = () => {
        if (setupDone) return;
        setupDone = true;
        const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
        // Council barrio areas sit under every zone layer: district-coloured fill,
        // outline, and "code + name" labels (skipped in fallback mode: no glyphs).
        map.addSource('barrios', {
          type: 'geojson',
          data: BARRIOS_URL,
          attribution: 'Barrios: Ayuntamiento de Madrid',
        });
        map.addLayer({
          id: 'barrios-fill',
          type: 'fill',
          source: 'barrios',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 },
        });
        map.addLayer({
          id: 'barrios-line',
          type: 'line',
          source: 'barrios',
          paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.9 },
        });
        if (!fallbackMode)
          map.addLayer({
            id: 'barrios-label',
            type: 'symbol',
            source: 'barrios',
            minzoom: 11,
            maxzoom: 15.5,
            layout: {
              'text-field': ['concat', ['get', 'code'], '\n', ['get', 'name']],
              'text-font': ['Noto Sans Bold'],
              'text-size': 12,
            },
            paint: {
              'text-color': '#37474f',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.5,
            },
          });
        // Parking meters: only once individual spots are visible, and below the
        // zone layers so they never bury a spot.
        map.addSource('meters', {
          type: 'geojson',
          data: METERS_URL,
          attribution: 'Parquímetros: Ayuntamiento de Madrid',
        });
        map.addLayer({
          id: 'meters',
          type: 'circle',
          source: 'meters',
          minzoom: METERS_MIN_ZOOM,
          paint: {
            'circle-color': METERS_COLOR,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], METERS_MIN_ZOOM, 3, 18, 5],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
          },
        });
        for (const kind of STACK_ORDER) {
          const color = madridConfig.kinds[kind].color;
          const src = sourceId(kind);
          map.addSource(src, {
            type: 'geojson',
            data: empty,
            cluster: true,
            clusterMaxZoom: CLUSTER_MAX_ZOOM,
            clusterRadius: 45,
          });
          map.addLayer({
            id: `${src}-clusters`,
            type: 'circle',
            source: src,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': color,
              'circle-radius': CLUSTER_RADIUS,
              'circle-opacity': POINT_OPACITY,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            },
          });
          if (!fallbackMode)
            map.addLayer({
              id: `${src}-count`,
              type: 'symbol',
              source: src,
              filter: ['has', 'point_count'],
              layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-size': 12,
                'text-font': ['Noto Sans Bold'],
                'text-allow-overlap': true,
              },
              paint: { 'text-color': '#ffffff' },
            });
          map.addLayer({
            id: `${src}-points`,
            type: 'circle',
            source: src,
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': ['case', ['get', 'tried'], TRIED_COLOR, color],
              'circle-radius': [
                'case',
                ['get', 'highlighted'],
                POINT_RADIUS + 4,
                ['get', 'tried'],
                POINT_RADIUS + 2,
                POINT_RADIUS,
              ],
              'circle-opacity': POINT_OPACITY,
              'circle-stroke-width': ['case', ['get', 'highlighted'], 4, ['get', 'tried'], 3, 1.5],
              'circle-stroke-color': [
                'case',
                ['get', 'highlighted'],
                '#ffb300',
                ['get', 'tried'],
                '#616161',
                '#ffffff',
              ],
            },
          });
        }
        map.addSource('user', { type: 'geojson', data: empty });
        map.addLayer({
          id: 'user-accuracy',
          type: 'circle',
          source: 'user',
          paint: {
            'circle-color': '#1a73e8',
            'circle-opacity': 0.15,
            'circle-radius': accuracyRadius(0, madridConfig.center.lat),
            'circle-stroke-width': 1,
            'circle-stroke-color': '#1a73e8',
            'circle-stroke-opacity': 0.4,
          },
        });
        map.addLayer({
          id: 'user-dot',
          type: 'circle',
          source: 'user',
          paint: {
            'circle-color': '#1a73e8',
            'circle-radius': 8,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
          },
        });
        setReady(true);
      };
      map.on('load', setup);
      // Style failed before load (e.g. tile server down): switch to the blank style.
      map.on('error', (e) => {
        if (setupDone || fallbackMode || (e as { tile?: unknown }).tile) return;
        fallbackMode = true;
        map.setStyle(FALLBACK_STYLE);
        map.once('style.load', setup);
      });

      // Only user gestures carry an originalEvent; programmatic easeTo does not.
      const stopFollowing = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) setFollow(false);
      };
      map.on('dragstart', stopFollowing);
      map.on('zoomstart', stopFollowing);

      // Click a cluster to zoom in.
      for (const kind of KINDS) {
        map.on('click', `${sourceId(kind)}-clusters`, (e) => {
          const f = e.features?.[0];
          if (!f || f.geometry.type !== 'Point') return;
          const src = map.getSource<GeoJSONSource>(sourceId(kind));
          const clusterId = f.properties?.cluster_id as number;
          const [lng, lat] = f.geometry.coordinates as [number, number];
          setFollow(false);
          void src?.getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({ center: [lng, lat], zoom });
          });
        });
      }

      // Long press (~600 ms, lone primary pointer, no significant movement).
      const press = createLongPress(
        (p) => {
          const ll = map.unproject([p.x, p.y]);
          onLongPressRef.current({ lat: ll.lat, lng: ll.lng });
        },
        { delayMs: LONG_PRESS_MS, slopPx: LONG_PRESS_SLOP_PX },
      );
      // Container-relative coordinates (for unproject); the slop is a delta.
      const toPoint = (e: PointerEvent): PressPoint => {
        const rect = container.getBoundingClientRect();
        return {
          pointerId: e.pointerId,
          isPrimary: e.isPrimary,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      };
      const onDown = (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        press.down(toPoint(e));
      };
      const onMove = (e: PointerEvent) => press.move(toPoint(e));
      const onUp = (e: PointerEvent) => press.up(e.pointerId);
      const onCancel = () => press.cancel();
      container.addEventListener('pointerdown', onDown);
      container.addEventListener('pointermove', onMove);
      container.addEventListener('pointerup', onUp);
      container.addEventListener('pointercancel', onUp);
      container.addEventListener('pointerleave', onCancel);
      // Backstop: any map movement cancels a pending press.
      map.on('movestart', onCancel);
      map.on('dragstart', onCancel);

      return () => {
        press.reset();
        container.removeEventListener('pointerdown', onDown);
        container.removeEventListener('pointermove', onMove);
        container.removeEventListener('pointerup', onUp);
        container.removeEventListener('pointercancel', onUp);
        container.removeEventListener('pointerleave', onCancel);
        setReady(false);
        map.remove();
        mapRef.current = null;
      };
    }
  }, []);

  // Zone data: update existing sources, never recreate the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const all = stretchesToGeoJson(
      data.stretches,
      settings,
      triedStretchIds,
      highlightedStretchIds,
    );
    for (const kind of KINDS) {
      map.getSource<GeoJSONSource>(sourceId(kind))?.setData({
        type: 'FeatureCollection',
        features: all.features.filter((f) => f.properties?.kind === kind),
      });
    }
  }, [ready, data.stretches, settings, triedStretchIds, highlightedStretchIds]);

  // User position: dot + accuracy circle, and follow while enabled.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource<GeoJSONSource>('user');
    if (!position) {
      src?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    src?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [position.point.lng, position.point.lat] },
    });
    map.setPaintProperty(
      'user-accuracy',
      'circle-radius',
      accuracyRadius(position.accuracyM, position.point.lat),
    );
    if (followingRef.current) {
      map.easeTo({
        center: [position.point.lng, position.point.lat],
        zoom: Math.max(map.getZoom(), FOLLOW_ZOOM - 2),
      });
    }
  }, [ready, position]);

  // Recenter: button or external signal re-enables following.
  const recenter = () => {
    setFollow(true);
    const map = mapRef.current;
    if (map && position) {
      map.easeTo({
        center: [position.point.lng, position.point.lat],
        zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
      });
    }
  };
  const recenterRef = useRef(recenter);
  useEffect(() => {
    recenterRef.current = recenter;
  });
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    recenterRef.current();
  }, [recenterSignal]);

  // Fit: show origin + ranked + tried zones. Programmatic (no originalEvent),
  // so it never reads as a user gesture; follow stays off until Recenter.
  const fitId = fitTo?.id ?? null;
  const fitPointsRef = useRef(fitTo?.points ?? []);
  useEffect(() => {
    fitPointsRef.current = fitTo?.points ?? [];
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || fitId === null) return;
    const bounds = boundsForPoints(fitPointsRef.current);
    if (!bounds) return;
    const root = containerRef.current?.closest('main') ?? document;
    const h = (sel: string) => root.querySelector<HTMLElement>(sel)?.offsetHeight ?? 0;
    const margin = 32;
    setFollow(false);
    map.fitBounds(bounds, {
      padding: {
        top: h('.overlay-top') + margin,
        bottom: h('[data-testid="overlay-bottom"]') + margin,
        left: margin,
        right: margin,
      },
      maxZoom: 17,
      duration: 600,
    });
  }, [ready, fitId]);

  // Destination pin: created, moved and removed with the prop; removed on unmount.
  const pinRef = useRef<Marker | null>(null);
  const pinLat = destinationPin?.lat ?? null;
  const pinLng = destinationPin?.lng ?? null;
  const pinName = t('map.destinationPin');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || pinLat === null || pinLng === null) return;
    const marker = new Marker({ color: PIN_COLOR }).setLngLat([pinLng, pinLat]).addTo(map);
    const el = marker.getElement();
    // Never intercept map gestures (the next long-press may start on the pin).
    el.style.pointerEvents = 'none';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', pinName);
    pinRef.current = marker;
    return () => {
      marker.remove();
      if (pinRef.current === marker) pinRef.current = null;
    };
  }, [ready, pinLat, pinLng, pinName]);

  // Highlight: ease to the zone's target.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !highlightedZoneId) return;
    const zone = data.candidates.find((c) => c.id === highlightedZoneId);
    if (!zone) return;
    setFollow(false);
    map.easeTo({
      center: [zone.target.lng, zone.target.lat],
      zoom: Math.max(map.getZoom(), HIGHLIGHT_ZOOM),
    });
  }, [ready, highlightedZoneId, data.candidates]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        data-testid="map"
        data-tried-count={tried.length}
        style={{ position: 'absolute', inset: 0 }}
      />
      <button
        type="button"
        aria-label={t('map.recenter')}
        aria-pressed={following}
        onClick={recenter}
        style={{
          position: 'absolute',
          right: 12,
          bottom: 'calc(var(--overlay-bottom-h, 0px) + 12px)',
          width: 48,
          height: 48,
          borderRadius: 24,
          border: 'none',
          background: '#ffffff',
          color: following ? '#1a73e8' : '#555555',
          fontSize: 24,
          zIndex: 5,
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          cursor: 'pointer',
        }}
      >
        ◎
      </button>
    </div>
  );
}
