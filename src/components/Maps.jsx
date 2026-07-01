import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useLiveClock from '../hooks/useLiveClock';
import glassChannel from '../lib/glassChannel';

delete L.Icon.Default.prototype._getIconUrl;

const USER_ICON = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#3B82F6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.25),0 2px 10px rgba(0,0,0,0.4)"></div>`,
  iconSize: [20, 20], iconAnchor: [10, 10],
});
const DEST_ICON = L.divIcon({
  className: '',
  html: `<svg width="32" height="42" viewBox="0 0 30 38"><path d="M15 2C9.5 2 5 6.5 5 12c0 7.5 10 18 10 18s10-10.5 10-18C25 6.5 20.5 2 15 2z" fill="#EF4444" stroke="#fff" stroke-width="1.5"/><circle cx="15" cy="12" r="4" fill="#fff"/></svg>`,
  iconSize: [32, 42], iconAnchor: [16, 42],
});
function makePlaceIcon(color = '#10B981') {
  return L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
    iconSize: [10, 10], iconAnchor: [5, 5],
  });
}

const CHIPS = [
  { label: '🍽 Eat',      overpass: 'amenity', value: 'restaurant|cafe|fast_food|food_court', color: '#F59E0B' },
  { label: '☕ Café',     overpass: 'amenity', value: 'cafe',                                  color: '#A78BFA' },
  { label: '🏥 Hospital', overpass: 'amenity', value: 'hospital|clinic|pharmacy|doctors',      color: '#10B981' },
  { label: '⛽ Fuel',     overpass: 'amenity', value: 'fuel',                                  color: '#EF4444' },
  { label: '🏦 ATM',      overpass: 'amenity', value: 'atm|bank',                              color: '#3B82F6' },
  { label: '🛒 Shop',     overpass: 'shop',    value: 'supermarket|convenience|mall',          color: '#FBBF24' },
];

function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
function fmtDist(km) { return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`; }
function fmtStep(step) {
  if (!step) return '';
  const mod  = step.maneuver?.modifier?.replace(/_/g, ' ');
  const type = step.maneuver?.type;
  if (type === 'depart') return `Head onto ${step.name || 'the road'}`;
  if (type === 'arrive') return 'Arrive at destination';
  return mod ? `${mod.charAt(0).toUpperCase() + mod.slice(1)} onto ${step.name || 'road'}` : `Continue on ${step.name || 'road'}`;
}
function placeLabel(tags) {
  const m = { restaurant:'Restaurant', cafe:'Café', hospital:'Hospital', pharmacy:'Pharmacy',
    bank:'Bank', fuel:'Petrol Station', bar:'Bar', fast_food:'Fast Food', supermarket:'Supermarket',
    mall:'Mall', park:'Park', hotel:'Hotel', attraction:'Attraction', museum:'Museum',
    clinic:'Clinic', atm:'ATM', doctors:'Doctor', food_court:'Food Court', convenience:'Store' };
  return m[tags.amenity] || m[tags.shop] || m[tags.tourism] || m[tags.leisure] || tags.amenity || tags.shop || 'Place';
}
function formatAddress(addr) {
  if (!addr) return '';
  return [addr.road, addr.suburb, addr.city_district].filter(Boolean).slice(0, 2).join(', ');
}

async function fetchNearby(lat, lon) {
  const q = `[out:json][timeout:18];(
    node["amenity"~"restaurant|cafe|hospital|pharmacy|bank|fuel|bar|fast_food|atm|clinic"](around:1200,${lat},${lon});
    node["shop"~"supermarket|mall|convenience"](around:1000,${lat},${lon});
    node["tourism"~"hotel|attraction|museum"](around:1200,${lat},${lon});
  );out body 40;`;
  const res  = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
  const data = await res.json();
  return (data.elements || []).filter(e => e.tags?.name && e.lat && e.lon)
    .map(e => ({ name: e.tags.name, label: placeLabel(e.tags), coords: [e.lat, e.lon] }));
}
async function fetchByCategory(chip, lat, lon) {
  const q   = `[out:json][timeout:15];node["${chip.overpass}"~"${chip.value}"](around:1500,${lat},${lon});out body 30;`;
  const res  = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
  const data = await res.json();
  return (data.elements || []).filter(e => e.tags?.name && e.lat && e.lon)
    .map(e => ({ name: e.tags.name, label: placeLabel(e.tags), coords: [e.lat, e.lon] }));
}
async function geocodeNear(query, userCoords) {
  if (!query.trim()) return [];
  let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=7&addressdetails=1`;
  if (userCoords) {
    const [lat, lon] = userCoords;
    url += `&viewbox=${lon-0.3},${lat+0.3},${lon+0.3},${lat-0.3}&bounded=0`;
  }
  return (await fetch(url, { headers: { 'Accept-Language': 'en' } })).json();
}
async function reverseGeocode(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { 'Accept-Language': 'en' } });
  return (await res.json()).address;
}
async function fetchRoute(from, to, mode) {
  const profile = mode === 'walking' ? 'foot' : 'driving';
  try {
    const data = await (await fetch(`https://router.project-osrm.org/route/v1/${profile}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true`)).json();
    if (data.code === 'Ok' && data.routes?.length) return data.routes[0];
  } catch {}
  return null;
}

export default function Maps() {
  const time = useLiveClock();

  // map refs
  const mapRef            = useRef(null);
  const mapInstanceRef    = useRef(null);
  const userMarkerRef     = useRef(null);
  const accuracyRef       = useRef(null);
  const destMarkerRef     = useRef(null);
  const routeLayerRef     = useRef(null);
  const placeLayerRef     = useRef(null);
  const searchTimer       = useRef(null);
  const userCoordsRef     = useRef(null);

  // nav tracking refs (used inside watchPosition)
  const navActiveRef      = useRef(false);
  const stepsRef          = useRef([]);
  const currentStepIdxRef = useRef(0);
  const followModeRef     = useRef(false);

  // location
  const [userCoords,      setUserCoords]      = useState(null);
  const [locStatus,       setLocStatus]       = useState('loading');
  const [currentAddress,  setCurrentAddress]  = useState('');
  const [followMode,      setFollowMode]      = useState(false);

  // nearby places
  const [nearbyPlaces,    setNearbyPlaces]    = useState([]);
  const [displayedPlaces, setDisplayedPlaces] = useState([]);
  const [nearbyLoading,   setNearbyLoading]   = useState(false);
  const [nearbyFetched,   setNearbyFetched]   = useState(false);
  const [activeChip,      setActiveChip]      = useState(null);
  const [chipLoading,     setChipLoading]     = useState(false);

  // search
  const [searchQuery,     setSearchQuery]     = useState('');
  const [searchResults,   setSearchResults]   = useState([]);
  const [searchLoading,   setSearchLoading]   = useState(false);
  const [searchOpen,      setSearchOpen]      = useState(false);

  // place preview (shown BEFORE navigation starts)
  const [selectedPlace,   setSelectedPlace]   = useState(null);
  const [preview,         setPreview]         = useState(null); // { driveMin, driveDist, walkMin, walkDist }
  const [previewLoading,  setPreviewLoading]  = useState(false);

  // navigation
  const [navActive,       setNavActive]       = useState(false);
  const [navPlace,        setNavPlace]        = useState(null);
  const [routeInfo,       setRouteInfo]       = useState(null);
  const [routeLoading,    setRouteLoading]    = useState(false);
  const [travelMode,      setTravelMode]      = useState('driving');
  const [currentStepIdx,  setCurrentStepIdx]  = useState(0);

  // keep refs in sync
  useEffect(() => { navActiveRef.current = navActive; }, [navActive]);
  useEffect(() => { stepsRef.current = routeInfo?.steps || []; currentStepIdxRef.current = 0; setCurrentStepIdx(0); }, [routeInfo]);
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);

  // ── init map ──
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([20, 78], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
    }).addTo(map);
    placeLayerRef.current = L.layerGroup().addTo(map);
    map.on('dragstart', () => { if (followModeRef.current) { setFollowMode(false); followModeRef.current = false; } });
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // ── continuous location + live step tracking ──
  useEffect(() => {
    if (!navigator.geolocation) { setLocStatus('denied'); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setUserCoords(coords); userCoordsRef.current = coords; setLocStatus('ok');
        const map = mapInstanceRef.current; if (!map) return;

        if (!userMarkerRef.current) {
          userMarkerRef.current = L.marker(coords, { icon: USER_ICON, zIndexOffset: 1000 }).addTo(map);
          map.setView(coords, 16);
        } else { userMarkerRef.current.setLatLng(coords); }

        if (accuracyRef.current) accuracyRef.current.remove();
        if (pos.coords.accuracy < 200) {
          accuracyRef.current = L.circle(coords, { radius: pos.coords.accuracy, color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.06, weight: 1, opacity: 0.3 }).addTo(map);
        }

        if (followModeRef.current) map.panTo(coords, { animate: true, duration: 1.0 });

        // live step advancement → push to glass
        if (navActiveRef.current) {
          const steps = stepsRef.current;
          const idx   = currentStepIdxRef.current;
          if (idx + 1 < steps.length) {
            const next = steps[idx + 1];
            if (next?.maneuver?.location) {
              const [slon, slat] = next.maneuver.location;
              if (haversine(coords, [slat, slon]) * 1000 < 40) {
                const ni = idx + 1;
                currentStepIdxRef.current = ni; setCurrentStepIdx(ni);
                const s = steps[ni];
                const mod = s.maneuver?.modifier?.replace(/_/g, ' ');
                const type = s.maneuver?.type;
                glassChannel?.postMessage({
                  type: 'nav_turn',
                  instruction: type === 'arrive' ? 'Arrive at destination' : mod ? mod.charAt(0).toUpperCase() + mod.slice(1) : 'Continue',
                  street: s.name || '',
                  distance: s.distance < 1000 ? `${Math.round(s.distance)} m` : `${(s.distance/1000).toFixed(1)} km`,
                });
              }
            }
          }
        }
      },
      () => setLocStatus('denied'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ── fetch nearby once ──
  useEffect(() => {
    if (!userCoords || nearbyFetched) return;
    setNearbyFetched(true); setNearbyLoading(true);
    Promise.all([fetchNearby(userCoords[0], userCoords[1]), reverseGeocode(userCoords[0], userCoords[1])])
      .then(([places, addr]) => {
        const sorted = places.map(p => ({ ...p, distKm: haversine(userCoords, p.coords) })).sort((a, b) => a.distKm - b.distKm).slice(0, 20);
        setNearbyPlaces(sorted); setDisplayedPlaces(sorted);
        setCurrentAddress(formatAddress(addr)); drawPlaceMarkers(sorted, '#10B981');
      }).catch(() => {}).finally(() => setNearbyLoading(false));
  }, [userCoords, nearbyFetched]);

  function drawPlaceMarkers(places, color) {
    const layer = placeLayerRef.current; if (!layer) return;
    layer.clearLayers();
    places.forEach(p => {
      const m = L.marker(p.coords, { icon: makePlaceIcon(color) });
      m.bindTooltip(p.name, { direction: 'top', offset: [0, -6], className: 'map-tooltip' });
      m.on('click', () => selectPlace(p)); layer.addLayer(m);
    });
  }

  async function handleChip(chip) {
    const coords = userCoordsRef.current; if (!coords) return;
    if (activeChip === chip.label) { setActiveChip(null); setDisplayedPlaces(nearbyPlaces); drawPlaceMarkers(nearbyPlaces, '#10B981'); return; }
    setActiveChip(chip.label); setChipLoading(true);
    try {
      const results = await fetchByCategory(chip, coords[0], coords[1]);
      const sorted  = results.map(p => ({ ...p, distKm: haversine(coords, p.coords) })).sort((a, b) => a.distKm - b.distKm).slice(0, 20);
      setDisplayedPlaces(sorted); drawPlaceMarkers(sorted, chip.color);
    } catch {}
    setChipLoading(false);
  }

  // ── PLACE PREVIEW — tap a place, see time+distance BEFORE navigating ──
  async function selectPlace(place) {
    const from = userCoordsRef.current;
    setSelectedPlace(place); setPreview(null); setPreviewLoading(true);

    const map = mapInstanceRef.current;
    if (destMarkerRef.current) destMarkerRef.current.remove();
    if (map) destMarkerRef.current = L.marker(place.coords, { icon: DEST_ICON }).addTo(map);
    if (map && from) map.fitBounds(L.latLngBounds([from, place.coords]), { padding: [120, 60], maxZoom: 16 });

    if (!from) { setPreviewLoading(false); return; }

    try {
      const [driveRoute, walkRoute] = await Promise.all([
        fetchRoute(from, place.coords, 'driving'),
        fetchRoute(from, place.coords, 'walking'),
      ]);
      const fmt = (r) => r ? (r.distance < 1000 ? `${Math.round(r.distance)} m` : `${(r.distance/1000).toFixed(1)} km`) : null;
      setPreview({
        driveMin:  driveRoute ? Math.round(driveRoute.duration / 60) : null,
        driveDist: fmt(driveRoute),
        walkMin:   walkRoute  ? Math.round(walkRoute.duration / 60)  : null,
        walkDist:  fmt(walkRoute),
      });
    } catch {}
    setPreviewLoading(false);
  }

  function dismissPreview() {
    setSelectedPlace(null); setPreview(null);
    if (destMarkerRef.current) { destMarkerRef.current.remove(); destMarkerRef.current = null; }
    if (userCoordsRef.current) mapInstanceRef.current?.setView(userCoordsRef.current, 16);
  }

  // ── START NAVIGATION ──
  async function startNav(place, mode) {
    const chosenMode = mode || travelMode;
    const from = userCoordsRef.current; if (!from) return;

    setSelectedPlace(null); setPreview(null);
    setNavPlace(place); setNavActive(true); setRouteLoading(true);
    setSearchQuery(''); setSearchOpen(false); setSearchResults([]);
    setFollowMode(true); followModeRef.current = true;
    if (chosenMode !== travelMode) setTravelMode(chosenMode);

    const map = mapInstanceRef.current;
    if (destMarkerRef.current) destMarkerRef.current.remove();
    if (routeLayerRef.current) routeLayerRef.current.remove();
    destMarkerRef.current = L.marker(place.coords, { icon: DEST_ICON }).addTo(map);

    const route = await fetchRoute(from, place.coords, chosenMode);
    setRouteLoading(false);

    if (route) {
      const durMin = Math.round(route.duration / 60);
      const dist   = route.distance < 1000 ? `${Math.round(route.distance)} m` : `${(route.distance/1000).toFixed(1)} km`;
      const dur    = durMin < 1 ? '< 1 min' : `${durMin} min`;
      const steps  = route.legs?.[0]?.steps || [];
      setRouteInfo({ dist, dur, durMin, steps });

      const s0  = steps[0];
      const mod0 = s0?.maneuver?.modifier?.replace(/_/g, ' ');
      glassChannel?.postMessage({
        type: 'nav_start',
        instruction: mod0 ? mod0.charAt(0).toUpperCase() + mod0.slice(1) : 'Head',
        street: s0?.name || place.name,
        distance: s0 ? (s0.distance < 1000 ? `${Math.round(s0.distance)} m` : `${(s0.distance/1000).toFixed(1)} km`) : dist,
        dest: place.name, eta: dur,
      });

      const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const group  = L.layerGroup();
      L.polyline(coords, { color: '#1D4ED8', weight: 10, opacity: 0.35, lineJoin: 'round' }).addTo(group);
      L.polyline(coords, { color: '#3B82F6', weight: 5,  opacity: 1,   lineJoin: 'round', lineCap: 'round' }).addTo(group);
      group.addTo(map); routeLayerRef.current = group;
      map.fitBounds(L.latLngBounds(coords), { padding: [110, 70] });
      setTimeout(() => { if (userCoordsRef.current && followModeRef.current) map.setView(userCoordsRef.current, 17, { animate: true }); }, 2000);
    } else {
      const dist = fmtDist(haversine(from, place.coords));
      setRouteInfo({ dist, dur: '~?', durMin: 0, steps: [] });
      const group = L.layerGroup();
      L.polyline([from, place.coords], { color: '#1D4ED8', weight: 8, opacity: 0.35, dashArray: '8 6' }).addTo(group);
      L.polyline([from, place.coords], { color: '#3B82F6', weight: 4, opacity: 0.8,  dashArray: '8 6' }).addTo(group);
      group.addTo(map); routeLayerRef.current = group;
      map.fitBounds(L.latLngBounds([from, place.coords]), { padding: [110, 70] });
      glassChannel?.postMessage({ type: 'nav_start', instruction: 'Head', street: place.name, distance: dist, dest: place.name, eta: '~?' });
    }
  }

  useEffect(() => {
    if (!navActive || !navPlace) return;
    startNav(navPlace, travelMode);
  }, [travelMode]); // eslint-disable-line

  function endNav() {
    setNavActive(false); setNavPlace(null); setRouteInfo(null); setCurrentStepIdx(0);
    setFollowMode(false); followModeRef.current = false;
    glassChannel?.postMessage({ type: 'nav_end' });
    if (destMarkerRef.current) { destMarkerRef.current.remove(); destMarkerRef.current = null; }
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null; }
    if (userCoordsRef.current) mapInstanceRef.current?.setView(userCoordsRef.current, 16);
  }

  function recenter() {
    const c = userCoordsRef.current; if (!c) return;
    mapInstanceRef.current?.setView(c, navActive ? 17 : 16, { animate: true });
    setFollowMode(true); followModeRef.current = true;
  }

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true); clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const results = await geocodeNear(searchQuery, userCoordsRef.current).catch(() => []);
      setSearchResults(results); setSearchLoading(false);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  const arriveTime     = routeInfo?.durMin ? new Date(Date.now() + routeInfo.durMin * 60000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--';
  const currentStep    = routeInfo?.steps?.[currentStepIdx];
  const nextStep       = routeInfo?.steps?.[currentStepIdx + 1];
  const showDropdown   = searchOpen && searchQuery.trim() && (searchLoading || searchResults.length > 0);
  const showNearby     = !navActive && !selectedPlace && !showDropdown;
  const showPreview    = !navActive && !!selectedPlace;

  return (
    <div className="view">
      <div ref={mapRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

      {/* zoom / recenter */}
      <div className="map-zoom-controls">
        <button className="map-zoom-btn" onClick={() => mapInstanceRef.current?.zoomIn()}>+</button>
        <button className="map-zoom-btn" onClick={() => mapInstanceRef.current?.zoomOut()}>−</button>
        <button className="map-zoom-btn" onClick={recenter}
          style={followMode ? { color:'#3B82F6', borderColor:'rgba(59,130,246,0.4)', background:'rgba(59,130,246,0.08)' } : {}}>
          <svg viewBox="0 0 24 24" fill={followMode ? '#3B82F6' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>
      </div>

      {/* recenter pill when dragged away mid-nav */}
      {navActive && !followMode && (
        <button className="recenter-pill" onClick={recenter}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
          Tap to recenter
        </button>
      )}

      {/* top chrome */}
      <div className="maps-top-chrome">
        <div className="status-bar" style={{ padding: 0 }}><span>{time}</span><span className="mono">93%</span></div>

        <div className="search-row">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            type="text"
            placeholder="Where do you want to go?"
            value={navActive ? (navPlace?.name || '') : selectedPlace ? selectedPlace.name : searchQuery}
            readOnly={navActive || !!selectedPlace}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => { if (!selectedPlace) setSearchOpen(true); }}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
          />
          {(navActive || selectedPlace)
            ? <button className="search-clear-btn" onClick={navActive ? endNav : dismissPreview}>✕</button>
            : searchQuery
              ? <button className="search-clear-btn" onClick={() => { setSearchQuery(''); setSearchResults([]); }}>✕</button>
              : <div className="mic-pill">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3"/></svg>
                  ready
                </div>
          }

          {showDropdown && (
            <div className="search-dropdown">
              {searchLoading && (
                <div className="search-drop-item"><span className="spinner" style={{ width:12, height:12, flexShrink:0 }} /><span style={{ fontSize:13, color:'var(--paper-dim)' }}>Searching…</span></div>
              )}
              {!searchLoading && searchResults.map((r, i) => {
                const title = r.display_name.split(',')[0];
                const sub   = r.display_name.split(',').slice(1, 3).join(', ').trim();
                return (
                  <div key={i} className="search-drop-item" onMouseDown={() => {
                    setSearchQuery(''); setSearchOpen(false); setSearchResults([]);
                    selectPlace({ name: title, coords: [parseFloat(r.lat), parseFloat(r.lon)], label: r.type || 'Place', distKm: null });
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14, flexShrink:0, color:'var(--paper-faint)' }}>
                      <path d="M12 21s-7-5.4-7-11a7 7 0 0 1 14 0c0 5.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>
                    </svg>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, color:'var(--paper)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</div>
                      {sub && <div style={{ fontSize:11.5, color:'var(--paper-faint)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sub}</div>}
                    </div>
                  </div>
                );
              })}
              {!searchLoading && searchResults.length === 0 && (
                <div className="search-drop-item" style={{ color:'var(--paper-faint)', fontSize:13 }}>No results found</div>
              )}
            </div>
          )}
        </div>

        {showNearby && !showDropdown && (
          <div className="chip-row">
            {CHIPS.map(chip => (
              <div key={chip.label}
                className={`chip${activeChip === chip.label ? ' active' : ''}`}
                style={activeChip === chip.label ? { borderColor:chip.color, color:chip.color, background:`${chip.color}18` } : {}}
                onMouseDown={() => handleChip(chip)}
              >
                {chipLoading && activeChip === chip.label && <span className="spinner" style={{ width:11, height:11, borderColor:`${chip.color}40`, borderTopColor:chip.color }} />}
                {chip.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {locStatus === 'loading' && <div className="location-banner"><span className="spinner" style={{ width:11, height:11, flexShrink:0 }} />Getting your precise location…</div>}
      {locStatus === 'denied'  && <div className="location-banner denied">Location access denied — enable in browser settings</div>}

      {/* ── NEARBY SHEET ── */}
      {showNearby && (
        <div className="sheet">
          <div className="sheet-grip" />
          <div className="sheet-title">
            {activeChip || 'Nearby'}
            {displayedPlaces.length > 0 && <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--blue-bright)', marginLeft:8, fontWeight:400 }}>{displayedPlaces.length} places</span>}
          </div>
          <div className="sheet-sub">{currentAddress ? `Near ${currentAddress}` : locStatus === 'ok' ? 'Tap a place to see time and distance' : 'Waiting for location…'}</div>
          {(nearbyLoading || chipLoading) && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 0', color:'var(--paper-faint)', fontSize:13 }}>
              <span className="spinner" />{chipLoading ? `Finding ${activeChip}…` : 'Finding places near you…'}
            </div>
          )}
          {!nearbyLoading && !chipLoading && displayedPlaces.length === 0 && locStatus === 'ok' && (
            <div style={{ fontSize:13, color:'var(--paper-faint)', padding:'10px 0' }}>No places found — try a different category</div>
          )}
          {displayedPlaces.slice(0, 7).map((p, i) => (
            <div key={i} className="place-row" onClick={() => selectPlace(p)}>
              <div className="place-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-5.4-7-11a7 7 0 0 1 14 0c0 5.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></div>
              <div className="place-main"><div className="place-name">{p.name}</div><div className="place-meta">{p.label}</div></div>
              <div className="place-dist">{fmtDist(p.distKm)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── PLACE PREVIEW SHEET — time + distance before navigating ── */}
      {showPreview && (
        <div className="sheet preview-sheet">
          <div className="sheet-grip" />
          <div className="preview-name">{selectedPlace.name}</div>
          <div className="preview-meta">
            {selectedPlace.label}
            {selectedPlace.distKm != null && <span className="preview-dist-pill">{fmtDist(selectedPlace.distKm)} away</span>}
          </div>

          {previewLoading ? (
            <div className="preview-loading">
              <span className="spinner" style={{ width:14, height:14, borderColor:'rgba(59,130,246,0.2)', borderTopColor:'#3B82F6' }} />
              <span>Calculating time…</span>
            </div>
          ) : preview ? (
            <div className="preview-modes">
              {/* drive */}
              <button className="preview-mode-card" onClick={() => startNav(selectedPlace, 'driving')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:22, height:22, flexShrink:0 }}>
                  <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v3h-7V8z"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                <div className="preview-mode-info">
                  <div className="preview-mode-time">{preview.driveMin != null ? `${preview.driveMin} min` : '—'}</div>
                  <div className="preview-mode-dist">{preview.driveDist || '—'} · Drive</div>
                </div>
                <span className="preview-go-btn">Go</span>
              </button>
              {/* walk */}
              <button className="preview-mode-card" onClick={() => startNav(selectedPlace, 'walking')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:22, height:22, flexShrink:0 }}>
                  <circle cx="13" cy="4" r="2"/><path d="M9.5 9.5L11 16l-3 2M14.5 9.5L13 16l3 2M9.5 9.5c1-1.5 3-2 5 0"/>
                </svg>
                <div className="preview-mode-info">
                  <div className="preview-mode-time">{preview.walkMin != null ? `${preview.walkMin} min` : '—'}</div>
                  <div className="preview-mode-dist">{preview.walkDist || '—'} · Walk</div>
                </div>
                <span className="preview-go-btn">Go</span>
              </button>
            </div>
          ) : (
            <div className="preview-loading" style={{ color:'var(--paper-faint)' }}>Could not calculate route</div>
          )}

          <button className="preview-dismiss-btn" onClick={dismissPreview}>Cancel</button>
        </div>
      )}

      {/* ── NAV SHEET ── */}
      {navActive && (
        <div className="nav-sheet">
          {routeLoading ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'18px 0' }}>
              <span className="spinner" style={{ width:16, height:16, borderColor:'rgba(59,130,246,0.2)', borderTopColor:'#3B82F6' }} />
              <span style={{ fontSize:13, color:'var(--paper-dim)' }}>Calculating route…</span>
            </div>
          ) : routeInfo && (
            <>
              <div className="glass-stream-banner">
                <div className="glass-stream-dot" />
                <div className="glass-stream-text">
                  <div className="glass-stream-title">Streaming to glass HUD</div>
                  <div className="glass-stream-sub">All turns appear on your lens automatically</div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:18, height:18, stroke:'var(--sage-bright)', flexShrink:0 }}>
                  <ellipse cx="7" cy="12" rx="4" ry="3.2"/><ellipse cx="17" cy="12" rx="4" ry="3.2"/><path d="M11 11c.6-1 1.4-1 2 0"/>
                </svg>
              </div>

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--paper)', fontFamily:'Space Grotesk,sans-serif' }}>{navPlace?.name}</div>
                  <div style={{ fontSize:12, color:'var(--paper-faint)', marginTop:2 }}>{routeInfo.dur} · {routeInfo.dist}</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className={`nav-mode-btn${travelMode==='driving'?' active':''}`} onClick={() => setTravelMode('driving')} style={{ padding:'7px 12px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  </button>
                  <button className={`nav-mode-btn${travelMode==='walking'?' active':''}`} onClick={() => setTravelMode('walking')} style={{ padding:'7px 12px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="2"/><path d="M9.5 9.5L11 16l-3 2M14.5 9.5L13 16l3 2M9.5 9.5c1-1.5 3-2 5 0"/></svg>
                  </button>
                </div>
              </div>

              {currentStep && (
                <div className="current-turn-card">
                  <div className="current-turn-label">NOW ON GLASS</div>
                  <div className="current-turn-text">{fmtStep(currentStep)}</div>
                  {nextStep && <div className="current-turn-next">then → {fmtStep(nextStep)}</div>}
                </div>
              )}

              <div className="nav-stats" style={{ marginTop:12 }}>
                <div className="nav-stat"><div className="nav-stat-label">ETA</div><div className="nav-stat-value">{routeInfo.dur}</div></div>
                <div className="nav-stat"><div className="nav-stat-label">DISTANCE</div><div className="nav-stat-value">{routeInfo.dist}</div></div>
                <div className="nav-stat"><div className="nav-stat-label">ARRIVE</div><div className="nav-stat-value">{arriveTime}</div></div>
              </div>

              <button className="btn-end-nav" onClick={endNav}>End route</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
