import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Position } from '../adapters/location';
import { madridConfig } from '../cities/madrid/config';
import type { LatLng, Settings } from '../core/types';
import { createLongPress } from './longPress';
import type { PressPoint } from './longPress';
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
}

// Vite does not emit MapLibre's worker file on its own (the default URL is
// import.meta-relative and 404s in the production build), so bundle it explicitly.
setWorkerUrl(maplibreWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const LONG_PRESS_MS = 600;
const LONG_PRESS_SLOP_PX = 10;
const FOLLOW_ZOOM = 16;
const HIGHLIGHT_ZOOM = 16;
const TRIED_COLOR = '#9a9a9a';
const CLUSTER_MAX_ZOOM = 16;

// One clustered GeoJSON source per kind, so every cluster bubble is single
// coloured and blue/green are styled by the exact same expressions.
const KINDS = ['visitor', 'resident'] as const;
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
}: MapViewProps) {
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
    const map = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: [madridConfig.center.lng, madridConfig.center.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Test-only debug hook; exposed solely when the URL carries ?e2e.
    if (new URLSearchParams(window.location.search).has('e2e')) {
      (window as unknown as { __bzaMap?: MapLibreMap }).__bzaMap = map;
    }

    map.on('load', () => {
      const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
      for (const kind of KINDS) {
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
            'circle-radius': ['case', ['get', 'highlighted'], POINT_RADIUS + 4, POINT_RADIUS],
            'circle-opacity': POINT_OPACITY,
            'circle-stroke-width': ['case', ['get', 'highlighted'], 4, 1.5],
            'circle-stroke-color': ['case', ['get', 'highlighted'], '#ffb300', '#ffffff'],
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
        aria-label="Recenter"
        aria-pressed={following}
        onClick={recenter}
        style={{
          position: 'absolute',
          right: 12,
          bottom: 24,
          width: 48,
          height: 48,
          borderRadius: 24,
          border: 'none',
          background: '#ffffff',
          color: following ? '#1a73e8' : '#555555',
          fontSize: 24,
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          cursor: 'pointer',
        }}
      >
        ◎
      </button>
    </div>
  );
}
