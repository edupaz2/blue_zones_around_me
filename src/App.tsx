import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reversePlace } from './adapters/geocoder';
import { track } from './analytics';
import { madridConfig } from './cities/madrid/config';
import { inBounds } from './core/bounds';
import { buildNavigationUrl } from './core/handoff';
import type { LatLng } from './core/types';
import { useI18n } from './i18n';
import AroundMeButton from './ui/AroundMeButton';
import CandidatePanel from './ui/CandidatePanel';
import FoundSpotPrompt from './ui/FoundSpotPrompt';
import MapView from './ui/MapView';
import NavAppChooser from './ui/NavAppChooser';
import { openNavigation } from './ui/openNavigation';
import SearchBar from './ui/SearchBar';
import SettingsSheet from './ui/SettingsSheet';
import StaleDataBanner from './ui/StaleDataBanner';
import { useAppState } from './ui/useAppState';
import { useZoneData } from './ui/useZoneData';
import type { ZoneData } from './ui/useZoneData';
import './ui/ui.css';

function Ready({ data }: { data: ZoneData }) {
  const { t } = useI18n();
  const { session, settings, position, locationStatus, ranked, dispatch, setSettings, widen } =
    useAppState(data);
  const [pickedId, setSelectedId] = useState<string | null>(null);
  // `null` = none; 'pin' = the destination pin itself; otherwise a zone id.
  const [pendingGo, setPendingGo] = useState<{ pin: true } | { zoneId: string } | null>(null);
  // Derived: a selection only counts while that zone is still in the list.
  const selectedId = ranked.ranked.some((r) => r.zone.id === pickedId) ? pickedId : null;
  const [pointError, setPointError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // At most one reverse lookup is in flight: any new search, the close button
  // and unmount abort it. (The reducer also ignores a late answer for a point that
  // is no longer the open destination search.)
  const lookupRef = useRef<AbortController | null>(null);
  const abortLookup = useCallback(() => {
    lookupRef.current?.abort();
    lookupRef.current = null;
  }, []);
  useEffect(() => abortLookup, [abortLookup]);

  const startDestination = (point: LatLng, label: string) => {
    abortLookup();
    setPointError(false);
    setSelectedId(null);
    dispatch({ type: 'start', origin: { mode: 'destination', point, label }, now: Date.now() });
  };

  const onLongPress = (p: LatLng) => {
    if (!inBounds(p, madridConfig.bounds)) {
      setPointError(true);
      return;
    }
    track('map-long-press');
    startDestination(p, t('app.selectedPoint'));
    // Never waits for the network: the search is already running with the fallback label.
    const ctl = new AbortController();
    lookupRef.current = ctl;
    void reversePlace(p, fetch, { signal: ctl.signal }).then((label) => {
      if (label === null || ctl.signal.aborted) return;
      dispatch({ type: 'relabel', point: p, label, now: Date.now() });
    });
  };

  const launch = (zoneId: string, app: 'google' | 'waze') => {
    const zone = data.candidates.find((z) => z.id === zoneId);
    if (!zone) return;
    // Persist the driving state first: iOS may reload the PWA once the nav app opens.
    const next = dispatch({ type: 'go', zoneId, now: Date.now() });
    // The reducer ignores `go` for an expired/non-choosing session: then do not navigate.
    if (next.status !== 'driving') return;
    track(app === 'google' ? 'go-google' : 'go-waze');
    openNavigation(buildNavigationUrl(app, zone.target));
  };

  // Navigates to the exact destination pin. The session stays `choosing`: the pin is
  // not a parking zone, so there is nothing to mark as tried.
  const launchPin = (app: 'google' | 'waze') => {
    const o = session.origin;
    if (session.status !== 'choosing' || o?.mode !== 'destination') return;
    track(app === 'google' ? 'go-google' : 'go-waze');
    openNavigation(buildNavigationUrl(app, o.point));
  };

  const onGo = (zoneId: string) => {
    if (settings.navApp === null) setPendingGo({ zoneId });
    else launch(zoneId, settings.navApp);
  };

  const onGoToPin = () => {
    if (settings.navApp === null) setPendingGo({ pin: true });
    else launchPin(settings.navApp);
  };

  const onChooseApp = (app: 'google' | 'waze') => {
    const pending = pendingGo;
    setPendingGo(null);
    setSettings({ ...settings, navApp: app });
    if (pending === null) return;
    if ('pin' in pending) launchPin(app);
    else launch(pending.zoneId, app);
  };

  // A mistaken Go: `go` was never dispatched, so the session is still `choosing`.
  const onCancelChooser = useCallback(() => setPendingGo(null), []);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const main = el.parentElement;
    const apply = () => main?.style.setProperty('--overlay-bottom-h', `${el.offsetHeight}px`);
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const origin = session.origin;
  const panelShown = session.status === 'choosing' && origin !== null;
  const destinationPin =
    origin?.mode === 'destination' && session.status !== 'idle' ? origin.point : null;
  const triedKey = session.tried.join(',');
  const fitTo = useMemo(() => {
    if (!origin || session.status !== 'choosing') return null;
    const triedPoints = data.candidates
      .filter((c) => session.tried.includes(c.id))
      .map((c) => c.target);
    return {
      id: `${origin.point.lat},${origin.point.lng}|${session.tried.length}|${ranked.radiusM ?? ''}`,
      points: [origin.point, ...ranked.ranked.map((r) => r.zone.target), ...triedPoints],
    };
    // Keyed on the identifying state only, so position updates do not re-fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.point.lat, origin?.point.lng, session.status, triedKey, ranked.radiusM]);

  const onNext = () => {
    const origin =
      session.origin?.mode === 'around' && position
        ? { mode: 'around' as const, point: position.point }
        : undefined;
    dispatch({ type: 'next', now: Date.now(), origin });
  };

  return (
    <main data-testid="app-ready" style={{ position: 'fixed', inset: 0 }}>
      <MapView
        data={data}
        settings={settings}
        position={position}
        tried={session.tried}
        highlightedZoneId={selectedId}
        onLongPress={onLongPress}
        recenterSignal={0}
        fitTo={fitTo}
        destinationPin={destinationPin}
      />
      <div className="overlay-top">
        <div className="top-row">
          <SearchBar
            onSelect={(r) => {
              track('search-address');
              startDestination(r.point, r.label);
            }}
          />
          <button
            type="button"
            className="settings-btn"
            aria-label={t('settings.title')}
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        </div>
        <StaleDataBanner sourceDate={data.sourceDate} now={Date.now()} />
        {pointError && (
          <p className="note" role="alert">
            {t('app.pointOutside')}
          </p>
        )}
      </div>
      <div className="overlay-bottom" data-testid="overlay-bottom" ref={bottomRef}>
        {panelShown && session.origin && (
          <CandidatePanel
            result={ranked}
            mode={session.origin.mode}
            destinationLabel={
              session.origin.mode === 'destination' ? session.origin.label : undefined
            }
            selectedId={selectedId}
            onSelect={setSelectedId}
            onGo={onGo}
            onGoToPin={session.origin.mode === 'destination' ? onGoToPin : undefined}
            onWiden={() => {
              track('widen');
              widen();
            }}
            onClose={() => {
              track('close-results');
              abortLookup();
              setSelectedId(null);
              dispatch({ type: 'cancel', now: Date.now() });
            }}
          />
        )}
        {!panelShown && (
          <AroundMeButton
            position={position}
            locationStatus={locationStatus}
            onPress={(origin) => {
              track('around-me');
              abortLookup();
              setPointError(false);
              setSelectedId(null);
              dispatch({ type: 'start', origin, now: Date.now() });
            }}
          />
        )}
      </div>
      {session.status === 'driving' && (
        <FoundSpotPrompt
          onFound={() => {
            track('found-yes');
            dispatch({ type: 'found', now: Date.now() });
          }}
          onNext={() => {
            track('found-next');
            onNext();
          }}
          onClose={() => dispatch({ type: 'dismiss', now: Date.now() })}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          sourceDate={data.sourceDate}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pendingGo !== null && <NavAppChooser onChoose={onChooseApp} onCancel={onCancelChooser} />}
    </main>
  );
}

export default function App() {
  const { t } = useI18n();
  const { status, data, retry } = useZoneData();
  if (status === 'loading') return <div role="status">{t('app.loading')}</div>;
  if (status === 'error' || !data) {
    return (
      <div role="alert">
        <p>{t('app.loadError')}</p>
        <button onClick={retry}>{t('app.retry')}</button>
      </div>
    );
  }
  return <Ready data={data} />;
}
