import { useState, useEffect, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import useLiveClock from '../hooks/useLiveClock';
import glassChannel from '../lib/glassChannel';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;

const MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#0f1117' }] },
  { elementType: 'labels.icon',         stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#8a9bb0' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#0f1117' }] },
  { featureType: 'administrative',      elementType: 'geometry',              stylers: [{ color: '#1a1d2e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdc1d4' }] },
  { featureType: 'poi',                 stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park',            elementType: 'geometry',              stylers: [{ color: '#181f2d' }] },
  { featureType: 'road',                elementType: 'geometry',              stylers: [{ color: '#1e2235' }] },
  { featureType: 'road',                elementType: 'geometry.stroke',       stylers: [{ color: '#111827' }] },
  { featureType: 'road',                elementType: 'labels.text.fill',      stylers: [{ color: '#8a9bb0' }] },
  { featureType: 'road.arterial',       elementType: 'geometry',              stylers: [{ color: '#222c44' }] },
  { featureType: 'road.highway',        elementType: 'geometry',              stylers: [{ color: '#2c3d6b' }] },
  { featureType: 'road.highway',        elementType: 'geometry.stroke',       stylers: [{ color: '#1a1d2e' }] },
  { featureType: 'road.highway',        elementType: 'labels.text.fill',      stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit',             stylers: [{ visibility: 'off' }] },
  { featureType: 'water',               elementType: 'geometry',              stylers: [{ color: '#06080f' }] },
  { featureType: 'water',               elementType: 'labels.text.fill',      stylers: [{ color: '#515c6d' }] },
];

const CHIPS = [
  { label: '🍽 Eat',      type: 'restaurant',  color: '#F59E0B' },
  { label: '☕ Café',     type: 'cafe',         color: '#A78BFA' },
  { label: '🏥 Hospital', type: 'hospital',     color: '#10B981' },
  { label: '⛽ Fuel',     type: 'gas_station',  color: '#EF4444' },
  { label: '🏦 ATM',      type: 'atm',          color: '#3B82F6' },
  { label: '🛒 Shop',     type: 'supermarket',  color: '#FBBF24' },
];

function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
function fmtDist(km) { return km < 1 ? `${Math.round(km*1000)} m` : `${km.toFixed(1)} km`; }
function stripHtml(html) { return (html||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(); }
function fmtDur(text) {
  if (!text) return text;
  return text
    .replace(/(\d+)\s*hours?\s*/i, '$1 h ')
    .replace(/(\d+)\s*mins?/i, '$1 min')
    .replace(/\s+/g, ' ')
    .trim();
}

function stepInstruction(step) {
  const m = step?.maneuver || '';
  if (!m || m === 'straight') return 'Continue';
  if (m.includes('uturn'))  return 'U-turn';
  if (m.includes('left'))   return m.includes('sharp') ? 'Sharp left'  : m.includes('slight') ? 'Slight left'  : 'Left';
  if (m.includes('right'))  return m.includes('sharp') ? 'Sharp right' : m.includes('slight') ? 'Slight right' : 'Right';
  if (m.includes('merge'))  return 'Merge';
  if (m.includes('fork'))   return m.includes('left') ? 'Keep left' : 'Keep right';
  if (m === 'roundabout-left' || m === 'roundabout-right') return 'Roundabout';
  return 'Continue';
}

function stepStreet(step) {
  const txt = stripHtml(step?.instructions || '');
  const m = txt.match(/\bonto\s+(.+)$/) || txt.match(/\btoward\s+(.+)$/);
  return m ? m[1].replace(/\.$/, '') : txt.split(' ').slice(-3).join(' ');
}

function makePlaceDot(google, color) {
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      `<svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="5" fill="${color}" stroke="white" stroke-width="1.5"/></svg>`
    ),
    scaledSize: new google.maps.Size(12, 12),
    anchor: new google.maps.Point(6, 6),
  };
}
function makeDestIcon(google) {
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      `<svg width="32" height="42" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg"><path d="M15 2C9.5 2 5 6.5 5 12c0 7.5 10 18 10 18s10-10.5 10-18C25 6.5 20.5 2 15 2z" fill="#EF4444" stroke="white" stroke-width="1.5"/><circle cx="15" cy="12" r="4" fill="white"/></svg>`
    ),
    scaledSize: new google.maps.Size(32, 42),
    anchor: new google.maps.Point(16, 42),
  };
}

function TurnArrowIcon({ instruction = '', size = 34, color = '#fff' }) {
  const i = (instruction || '').toLowerCase();
  const s = { width: size, height: size };
  if (/arrive|destination/.test(i)) return (
    <svg viewBox="0 0 60 60" fill="none" style={s}>
      <circle cx="30" cy="30" r="20" stroke={color} strokeWidth="3.5"/>
      <circle cx="30" cy="30" r="8" fill={color}/>
    </svg>
  );
  if (/u.?turn/.test(i)) return (
    <svg viewBox="0 0 60 60" fill="none" style={s}>
      <path d="M38 48V22a10 10 0 0 0-20 0v4" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <path d="M18 20l-8 6 8 6" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (/left/.test(i)) return (
    <svg viewBox="0 0 60 60" fill="none" style={s}>
      <path d="M22 48V28h22" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M30 20l-8 8 8 8" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (/right/.test(i)) return (
    <svg viewBox="0 0 60 60" fill="none" style={s}>
      <path d="M38 48V28H16" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M30 20l8 8-8 8" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  return (
    <svg viewBox="0 0 60 60" fill="none" style={s}>
      <path d="M30 48V14" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <path d="M18 26l12-12 12 12" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function Maps() {
  const time = useLiveClock();

  const mapRef                 = useRef(null);
  const mapInstanceRef         = useRef(null);
  const googleRef              = useRef(null);
  const userMarkerRef          = useRef(null);
  const accuracyCircleRef      = useRef(null);
  const destMarkerRef          = useRef(null);
  const placeMarkersRef        = useRef([]);
  const directionsServiceRef   = useRef(null);
  const directionsRendererRef  = useRef(null);
  const placesServiceRef       = useRef(null);
  const geocoderRef            = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const userCoordsRef          = useRef(null);
  const navActiveRef           = useRef(false);
  const stepsRef               = useRef([]);
  const currentStepIdxRef      = useRef(0);
  const followModeRef          = useRef(false);
  const searchTimer            = useRef(null);
  const pendingShareRef        = useRef(null);

  const [mapReady,        setMapReady]        = useState(false);
  const [locStatus,       setLocStatus]       = useState('loading');
  const [userCoords,      setUserCoords]      = useState(null);
  const [currentAddress,  setCurrentAddress]  = useState('');
  const [followMode,      setFollowMode]      = useState(false);
  const [battery,         setBattery]         = useState(null);

  const [nearbyPlaces,    setNearbyPlaces]    = useState([]);
  const [displayedPlaces, setDisplayedPlaces] = useState([]);
  const [nearbyLoading,   setNearbyLoading]   = useState(false);
  const [nearbyFetched,   setNearbyFetched]   = useState(false);
  const [activeChip,      setActiveChip]      = useState(null);
  const [chipLoading,     setChipLoading]     = useState(false);

  const [searchQuery,     setSearchQuery]     = useState('');
  const [searchResults,   setSearchResults]   = useState([]);
  const [searchLoading,   setSearchLoading]   = useState(false);
  const [searchOpen,      setSearchOpen]      = useState(false);

  const [selectedPlace,   setSelectedPlace]   = useState(null);
  const [preview,         setPreview]         = useState(null);
  const [previewLoading,  setPreviewLoading]  = useState(false);

  const [sheetMinimized,  setSheetMinimized]  = useState(false);

  const [navActive,       setNavActive]       = useState(false);
  const [navPlace,        setNavPlace]        = useState(null);
  const [routeInfo,       setRouteInfo]       = useState(null);
  const [routeLoading,    setRouteLoading]    = useState(false);
  const [travelMode,      setTravelMode]      = useState('driving');
  const [currentStepIdx,  setCurrentStepIdx]  = useState(0);

  useEffect(() => { navActiveRef.current = navActive; }, [navActive]);
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);
  useEffect(() => { stepsRef.current = routeInfo?.steps || []; currentStepIdxRef.current = 0; setCurrentStepIdx(0); }, [routeInfo]);

  useEffect(() => {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(b => {
      setBattery(Math.round(b.level * 100));
      b.addEventListener('levelchange', () => setBattery(Math.round(b.level * 100)));
    });
  }, []);

  // ── Web Share Target: read share query from sessionStorage (set by App.jsx) ──
  useEffect(() => {
    const q = sessionStorage.getItem('arvo_share_query');
    if (q) { pendingShareRef.current = q; sessionStorage.removeItem('arvo_share_query'); }
  }, []);

  // ── Trigger pending share search once map is ready ──
  useEffect(() => {
    if (!mapReady || !pendingShareRef.current) return;
    const q = pendingShareRef.current; pendingShareRef.current = null;
    setSearchQuery(q); setSearchOpen(true);
  }, [mapReady]);

  // ── init Google Maps ──
  useEffect(() => {
    if (!MAPS_KEY) { setLocStatus('no-key'); return; }
    const initMap = async () => {
      try {
        setOptions({ apiKey: MAPS_KEY, version: 'weekly' });
        const [mapsLib, placesLib, routesLib, geocodingLib] = await Promise.all([
          importLibrary('maps'),
          importLibrary('places'),
          importLibrary('routes'),
          importLibrary('geocoding'),
        ]);
        if (!mapRef.current) return;
        googleRef.current = window.google;
        const map = new mapsLib.Map(mapRef.current, {
          center: { lat: 20, lng: 78 }, zoom: 5,
          styles: MAP_STYLE, disableDefaultUI: true,
          gestureHandling: 'greedy', clickableIcons: false,
        });
        mapInstanceRef.current = map;
        directionsServiceRef.current  = new routesLib.DirectionsService();
        directionsRendererRef.current = new routesLib.DirectionsRenderer({
          suppressMarkers: true,
          polylineOptions: { strokeColor: '#3B82F6', strokeWeight: 5, strokeOpacity: 0.9 },
          map,
        });
        placesServiceRef.current       = new placesLib.PlacesService(map);
        geocoderRef.current            = new geocodingLib.Geocoder();
        autocompleteServiceRef.current = new placesLib.AutocompleteService();
        map.addListener('dragstart', () => {
          if (followModeRef.current) { setFollowMode(false); followModeRef.current = false; }
        });
        setMapReady(true);
      } catch {
        setLocStatus('error');
      }
    };
    initMap();
  }, []);

  // ── GPS watch ──
  useEffect(() => {
    if (!navigator.geolocation) { setLocStatus('denied'); return; }
    const id = navigator.geolocation.watchPosition(pos => {
      const coords = [pos.coords.latitude, pos.coords.longitude];
      setUserCoords(coords); userCoordsRef.current = coords; setLocStatus('ok');
      const google = googleRef.current; const map = mapInstanceRef.current;
      if (!google || !map) return;
      const latlng = new google.maps.LatLng(coords[0], coords[1]);

      if (!userMarkerRef.current) {
        userMarkerRef.current = new google.maps.Marker({
          position: latlng, map,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#3B82F6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
          zIndex: 1000,
        });
        map.setCenter(latlng); map.setZoom(16);
      } else { userMarkerRef.current.setPosition(latlng); }

      if (accuracyCircleRef.current) accuracyCircleRef.current.setMap(null);
      if (pos.coords.accuracy < 200) {
        accuracyCircleRef.current = new google.maps.Circle({
          center: latlng, radius: pos.coords.accuracy, map,
          fillColor: '#3B82F6', fillOpacity: 0.06,
          strokeColor: '#3B82F6', strokeOpacity: 0.3, strokeWeight: 1,
        });
      }
      if (followModeRef.current) map.panTo(latlng);
      if (navActiveRef.current) glassChannel?.postMessage({ type: 'location_update', lat: coords[0], lng: coords[1], speed: pos.coords.speed || 0 });

      if (navActiveRef.current) {
        const steps = stepsRef.current; const idx = currentStepIdxRef.current;
        if (idx + 1 < steps.length) {
          const ns = steps[idx + 1].start_location;
          if (haversine(coords, [ns.lat(), ns.lng()]) * 1000 < 40) {
            const ni = idx + 1;
            currentStepIdxRef.current = ni; setCurrentStepIdx(ni);
            glassChannel?.postMessage({
              type: 'nav_turn',
              instruction: stepInstruction(steps[ni]),
              street: stepStreet(steps[ni]),
              distance: steps[ni].distance.text,
            });
          }
        }
      }
    }, () => setLocStatus('denied'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ── fetch nearby (needs both coords AND map ready) ──
  useEffect(() => {
    if (!userCoords || nearbyFetched || !mapReady) return;
    const google = googleRef.current; const places = placesServiceRef.current; const geocoder = geocoderRef.current;
    if (!google || !places || !geocoder) return;
    setNearbyFetched(true); setNearbyLoading(true);
    const latlng = new google.maps.LatLng(userCoords[0], userCoords[1]);

    geocoder.geocode({ location: latlng }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const c = results[0].address_components;
        const sub  = c.find(x => x.types.includes('sublocality_level_1'))?.long_name;
        const city = c.find(x => x.types.includes('locality'))?.long_name;
        setCurrentAddress([sub, city].filter(Boolean).join(', '));
      }
    });

    places.nearbySearch({ location: latlng, radius: 1500, type: 'establishment' }, (results, status) => {
      setNearbyLoading(false);
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const mapped = results.filter(r => r.name && r.geometry?.location).map(r => ({
          name: r.name, label: (r.types?.[0] || 'place').replace(/_/g, ' '),
          coords: [r.geometry.location.lat(), r.geometry.location.lng()],
          distKm: haversine(userCoords, [r.geometry.location.lat(), r.geometry.location.lng()]),
          placeId: r.place_id,
        })).sort((a, b) => a.distKm - b.distKm).slice(0, 20);
        setNearbyPlaces(mapped); setDisplayedPlaces(mapped);
        drawPlaceMarkers(mapped, '#10B981', google);
      }
    });
  }, [userCoords, nearbyFetched, mapReady]);

  function drawPlaceMarkers(places, color, google) {
    placeMarkersRef.current.forEach(m => m.setMap(null));
    placeMarkersRef.current = [];
    const map = mapInstanceRef.current; if (!map || !google) return;
    places.forEach(p => {
      const marker = new google.maps.Marker({
        position: { lat: p.coords[0], lng: p.coords[1] }, map,
        icon: makePlaceDot(google, color), title: p.name,
      });
      marker.addListener('click', () => selectPlace(p));
      placeMarkersRef.current.push(marker);
    });
  }

  async function handleChip(chip) {
    const coords = userCoordsRef.current; if (!coords) return;
    const google = googleRef.current; const places = placesServiceRef.current;
    if (!google || !places) return;
    if (activeChip === chip.label) {
      setActiveChip(null); setDisplayedPlaces(nearbyPlaces); drawPlaceMarkers(nearbyPlaces, '#10B981', google); return;
    }
    setActiveChip(chip.label); setChipLoading(true);
    const latlng = new google.maps.LatLng(coords[0], coords[1]);
    places.nearbySearch({ location: latlng, radius: 1500, type: chip.type }, (results, status) => {
      setChipLoading(false);
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const mapped = results.filter(r => r.name && r.geometry?.location).map(r => ({
          name: r.name, label: chip.label.split(' ').slice(1).join(' '),
          coords: [r.geometry.location.lat(), r.geometry.location.lng()],
          distKm: haversine(coords, [r.geometry.location.lat(), r.geometry.location.lng()]),
          placeId: r.place_id,
        })).sort((a, b) => a.distKm - b.distKm).slice(0, 20);
        setDisplayedPlaces(mapped); drawPlaceMarkers(mapped, chip.color, google);
      }
    });
  }

  function getRoute(from, to, mode) {
    return new Promise(resolve => {
      const google = googleRef.current; const service = directionsServiceRef.current;
      if (!google || !service) { resolve(null); return; }
      service.route({
        origin: new google.maps.LatLng(from[0], from[1]),
        destination: new google.maps.LatLng(to[0], to[1]),
        travelMode: mode === 'walking' ? google.maps.TravelMode.WALKING : google.maps.TravelMode.DRIVING,
      }, (result, status) => resolve(status === 'OK' ? result : null));
    });
  }

  async function selectPlace(place) {
    const from = userCoordsRef.current;
    setSelectedPlace(place); setPreview(null); setPreviewLoading(true);
    const google = googleRef.current; const map = mapInstanceRef.current;
    if (destMarkerRef.current) destMarkerRef.current.setMap(null);
    if (google && map) {
      destMarkerRef.current = new google.maps.Marker({
        position: { lat: place.coords[0], lng: place.coords[1] }, map, icon: makeDestIcon(google),
      });
      if (from) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: from[0], lng: from[1] });
        bounds.extend({ lat: place.coords[0], lng: place.coords[1] });
        map.fitBounds(bounds, { top: 120, right: 60, bottom: 300, left: 60 });
      }
    }
    if (!from) { setPreviewLoading(false); return; }
    try {
      const [driveResult, walkResult] = await Promise.all([
        getRoute(from, place.coords, 'driving'),
        getRoute(from, place.coords, 'walking'),
      ]);
      const leg = r => r?.routes?.[0]?.legs?.[0];
      setPreview({
        driveMin:  leg(driveResult) ? Math.round(leg(driveResult).duration.value / 60) : null,
        driveDist: leg(driveResult)?.distance.text || null,
        walkMin:   leg(walkResult)  ? Math.round(leg(walkResult).duration.value  / 60) : null,
        walkDist:  leg(walkResult)?.distance.text  || null,
      });
    } catch {}
    setPreviewLoading(false);
  }

  function dismissPreview() {
    setSelectedPlace(null); setPreview(null);
    if (destMarkerRef.current) { destMarkerRef.current.setMap(null); destMarkerRef.current = null; }
    if (userCoordsRef.current) {
      mapInstanceRef.current?.setCenter({ lat: userCoordsRef.current[0], lng: userCoordsRef.current[1] });
      mapInstanceRef.current?.setZoom(16);
    }
  }

  async function startNav(place, mode) {
    const chosenMode = mode || travelMode;
    const from = userCoordsRef.current; if (!from) return;
    const google = googleRef.current; const map = mapInstanceRef.current;
    if (!google || !map) return;

    setSelectedPlace(null); setPreview(null);
    setNavPlace(place); setNavActive(true); setRouteLoading(true);
    setSearchQuery(''); setSearchOpen(false); setSearchResults([]);
    setFollowMode(true); followModeRef.current = true;
    if (chosenMode !== travelMode) setTravelMode(chosenMode);

    if (destMarkerRef.current) destMarkerRef.current.setMap(null);
    directionsRendererRef.current?.setMap(null);
    directionsRendererRef.current?.setMap(map);
    destMarkerRef.current = new google.maps.Marker({
      position: { lat: place.coords[0], lng: place.coords[1] }, map, icon: makeDestIcon(google),
    });

    const result = await getRoute(from, place.coords, chosenMode);
    setRouteLoading(false);

    if (result) {
      directionsRendererRef.current?.setDirections(result);
      const leg = result.routes[0].legs[0];
      const steps = leg.steps;
      setRouteInfo({ dist: leg.distance.text, dur: fmtDur(leg.duration.text), durSec: leg.duration.value, steps });
      glassChannel?.postMessage({
        type: 'nav_start',
        instruction: stepInstruction(steps[0]),
        street: stepStreet(steps[0]),
        distance: steps[0].distance.text,
        dest: place.name, eta: fmtDur(leg.duration.text),
      });
      setTimeout(() => {
        if (userCoordsRef.current && followModeRef.current) {
          map.setCenter({ lat: userCoordsRef.current[0], lng: userCoordsRef.current[1] });
          map.setZoom(17);
        }
      }, 2000);
    } else {
      const dist = fmtDist(haversine(from, place.coords));
      setRouteInfo({ dist, dur: '~?', durSec: 0, steps: [] });
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
    directionsRendererRef.current?.setMap(null);
    if (destMarkerRef.current) { destMarkerRef.current.setMap(null); destMarkerRef.current = null; }
    glassChannel?.postMessage({ type: 'nav_end' });
    if (userCoordsRef.current) {
      mapInstanceRef.current?.setCenter({ lat: userCoordsRef.current[0], lng: userCoordsRef.current[1] });
      mapInstanceRef.current?.setZoom(16);
    }
  }

  function recenter() {
    const c = userCoordsRef.current; if (!c) return;
    mapInstanceRef.current?.setCenter({ lat: c[0], lng: c[1] });
    mapInstanceRef.current?.setZoom(navActive ? 17 : 16);
    setFollowMode(true); followModeRef.current = true;
  }

  // ── autocomplete search ──
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true); clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const service = autocompleteServiceRef.current; const google = googleRef.current; const coords = userCoordsRef.current;
      if (!service || !google) { setSearchLoading(false); return; }
      const req = { input: searchQuery };
      if (coords) req.locationBias = new google.maps.Circle({ center: new google.maps.LatLng(coords[0], coords[1]), radius: 50000 });
      service.getPlacePredictions(req, (predictions, status) => {
        setSearchLoading(false);
        setSearchResults(status === google.maps.places.PlacesServiceStatus.OK && predictions ? predictions : []);
      });
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  function selectPrediction(pred) {
    setSearchQuery(''); setSearchOpen(false); setSearchResults([]);
    const places = placesServiceRef.current; if (!places) return;
    places.getDetails({ placeId: pred.place_id, fields: ['name', 'geometry', 'types'] }, (place, status) => {
      if (status === 'OK' && place?.geometry) {
        selectPlace({
          name: place.name,
          label: (place.types?.[0] || 'place').replace(/_/g, ' '),
          coords: [place.geometry.location.lat(), place.geometry.location.lng()],
          distKm: userCoordsRef.current ? haversine(userCoordsRef.current, [place.geometry.location.lat(), place.geometry.location.lng()]) : null,
          placeId: pred.place_id,
        });
      }
    });
  }

  const currentStep  = routeInfo?.steps?.[currentStepIdx];
  const nextStep     = routeInfo?.steps?.[currentStepIdx + 1];
  const arriveTime   = routeInfo?.durSec ? new Date(Date.now() + routeInfo.durSec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--';
  const showDropdown = searchOpen && searchQuery.trim() && (searchLoading || searchResults.length > 0);
  const showNearby   = !navActive && !selectedPlace && !showDropdown;
  const showPreview  = !navActive && !!selectedPlace;

  if (!MAPS_KEY) return (
    <div className="view" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:32 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" style={{ width:48, height:48 }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
      <div style={{ fontSize:15, fontWeight:600, color:'rgba(255,255,255,0.8)' }}>Google Maps key needed</div>
      <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', textAlign:'center', lineHeight:1.6 }}>Add VITE_GOOGLE_MAPS_KEY to your .env and Vercel env vars</div>
    </div>
  );

  return (
    <div className="view">
      <div ref={mapRef} style={{ position:'absolute', inset:0, zIndex:1 }} />

      <div className="map-zoom-controls">
        <button className="map-zoom-btn" onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom()||16)+1)}>+</button>
        <button className="map-zoom-btn" onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom()||16)-1)}>−</button>
        <button className="map-zoom-btn" onClick={recenter}
          style={followMode ? { color:'#3B82F6', borderColor:'rgba(59,130,246,0.4)', background:'rgba(59,130,246,0.08)' } : {}}>
          <svg viewBox="0 0 24 24" fill={followMode ? '#3B82F6' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>
      </div>

      {navActive && !followMode && (
        <button className="recenter-pill" onClick={recenter}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
          Tap to recenter
        </button>
      )}

      <div className="maps-top-chrome">
        <div className="status-bar" style={{ padding:0 }}>
          <span>{time}</span>
          {battery !== null && <span className="mono">{battery}%</span>}
        </div>

        {navActive ? (
          <div className="nav-top-card">
            {routeLoading ? (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span className="spinner" style={{ width:18, height:18, borderColor:'rgba(59,130,246,0.2)', borderTopColor:'#3B82F6' }}/>
                <span style={{ fontSize:14, color:'rgba(255,255,255,0.7)' }}>Calculating route…</span>
              </div>
            ) : currentStep ? (
              <>
                <div className="nav-top-arrow-box">
                  <TurnArrowIcon instruction={stepInstruction(currentStep)} size={34} color="#fff"/>
                </div>
                <div className="nav-top-info">
                  <div className="nav-top-dist">{currentStep.distance.text}</div>
                  <div className="nav-top-street">{stepStreet(currentStep)}</div>
                  {nextStep && <div className="nav-top-then">then · {stepInstruction(nextStep)}</div>}
                </div>
                <div className="nav-top-modes">
                  <button className={`nav-mode-btn${travelMode==='driving'?' active':''}`} onClick={() => setTravelMode('driving')} style={{ padding:'6px 8px', flex:'none', width:36 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:15, height:15 }}><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  </button>
                  <button className={`nav-mode-btn${travelMode==='walking'?' active':''}`} onClick={() => setTravelMode('walking')} style={{ padding:'6px 8px', flex:'none', width:36 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:15, height:15 }}><circle cx="13" cy="4" r="2"/><path d="M9.5 9.5L11 16l-3 2M14.5 9.5L13 16l3 2M9.5 9.5c1-1.5 3-2 5 0"/></svg>
                  </button>
                </div>
              </>
            ) : (
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>Navigating…</span>
            )}
          </div>
        ) : (
          <div className="search-row">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
            <input
              type="text"
              placeholder="Where do you want to go?"
              value={selectedPlace ? selectedPlace.name : searchQuery}
              readOnly={!!selectedPlace}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => { if (!selectedPlace) setSearchOpen(true); }}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            />
            {selectedPlace
              ? <button className="search-clear-btn" onClick={dismissPreview}>✕</button>
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
                {!searchLoading && searchResults.map((r, i) => (
                  <div key={i} className="search-drop-item" onMouseDown={() => selectPrediction(r)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14, flexShrink:0, color:'var(--paper-faint)' }}>
                      <path d="M12 21s-7-5.4-7-11a7 7 0 0 1 14 0c0 5.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>
                    </svg>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, color:'var(--paper)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {r.structured_formatting?.main_text || r.description}
                      </div>
                      {r.structured_formatting?.secondary_text && (
                        <div style={{ fontSize:11.5, color:'var(--paper-faint)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {r.structured_formatting.secondary_text}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="search-drop-item" style={{ color:'var(--paper-faint)', fontSize:13 }}>No results found</div>
                )}
              </div>
            )}
          </div>
        )}

        {showNearby && !showDropdown && (
          <div className="chip-row">
            {CHIPS.map(chip => (
              <div key={chip.label}
                className={`chip${activeChip === chip.label ? ' active' : ''}`}
                style={activeChip === chip.label ? { borderColor:chip.color, color:chip.color, background:`${chip.color}18` } : {}}
                onMouseDown={() => handleChip(chip)}>
                {chipLoading && activeChip === chip.label && <span className="spinner" style={{ width:11, height:11, borderColor:`${chip.color}40`, borderTopColor:chip.color }} />}
                {chip.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {locStatus === 'loading' && <div className="location-banner"><span className="spinner" style={{ width:11, height:11, flexShrink:0 }} />Getting your precise location…</div>}
      {locStatus === 'denied'  && <div className="location-banner denied">Location access denied — enable in browser settings</div>}
      {locStatus === 'error'   && <div className="location-banner denied">Google Maps failed to load — enable Maps JavaScript API, Places API, Directions API & Geocoding API in Google Cloud Console for your key</div>}

      {showNearby && (
        sheetMinimized ? (
          <button className="sheet-expand-pill" onClick={() => setSheetMinimized(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            {activeChip || 'Nearby'}{displayedPlaces.length > 0 && ` · ${displayedPlaces.length}`}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width:13, height:13 }}><path d="M18 15l-6-6-6 6"/></svg>
          </button>
        ) : (
          <div className="sheet">
            <div className="sheet-grip" />
            <button className="sheet-collapse-btn" onClick={() => setSheetMinimized(true)} title="Minimize">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}><path d="M6 9l6 6 6-6"/></svg>
            </button>
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
            {displayedPlaces.slice(0,7).map((p, i) => (
              <div key={i} className="place-row" onClick={() => selectPlace(p)}>
                <div className="place-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-5.4-7-11a7 7 0 0 1 14 0c0 5.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></div>
                <div className="place-main"><div className="place-name">{p.name}</div><div className="place-meta">{p.label}</div></div>
                <div className="place-dist">{fmtDist(p.distKm)}</div>
              </div>
            ))}
          </div>
        )
      )}

      {showPreview && (
        <div className="sheet preview-sheet">
          <div className="sheet-grip" />
          <div className="preview-name">{selectedPlace.name}</div>
          <div className="preview-meta">
            {selectedPlace.label}
            {selectedPlace.distKm != null && <span className="preview-dist-pill">{fmtDist(selectedPlace.distKm)} away</span>}
          </div>
          {previewLoading ? (
            <div className="preview-loading"><span className="spinner" style={{ width:14, height:14, borderColor:'rgba(59,130,246,0.2)', borderTopColor:'#3B82F6' }} /><span>Calculating time…</span></div>
          ) : preview ? (
            <div className="preview-modes">
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

      {navActive && (
        <div className="nav-bottom-strip">
          {routeLoading ? (
            <>
              <span className="spinner" style={{ width:14, height:14, borderColor:'rgba(59,130,246,0.2)', borderTopColor:'#3B82F6', flexShrink:0 }}/>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)', flex:1, marginLeft:8 }}>Calculating route…</span>
            </>
          ) : routeInfo ? (
            <>
              <div className="nav-strip-glass" title="Streaming to glass HUD">
                <span className="nav-strip-dot"/>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:13, height:13, stroke:'#10B981', flexShrink:0 }}>
                  <ellipse cx="7" cy="12" rx="4" ry="3.2"/><ellipse cx="17" cy="12" rx="4" ry="3.2"/><path d="M11 11c.6-1 1.4-1 2 0"/>
                </svg>
              </div>
              <div className="nav-strip-data">
                <div className="nav-strip-item">
                  <span className="nav-strip-val">{routeInfo.dur}</span>
                  <span className="nav-strip-lbl">ETA</span>
                </div>
                <div className="nav-strip-sep"/>
                <div className="nav-strip-item">
                  <span className="nav-strip-val">{routeInfo.dist}</span>
                  <span className="nav-strip-lbl">DIST</span>
                </div>
                <div className="nav-strip-sep"/>
                <div className="nav-strip-item">
                  <span className="nav-strip-val">{arriveTime}</span>
                  <span className="nav-strip-lbl">ARRIVE</span>
                </div>
              </div>
            </>
          ) : null}
          <button className="nav-strip-end-btn" onClick={endNav}>End</button>
        </div>
      )}
    </div>
  );
}
