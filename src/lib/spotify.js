const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming',
  'user-read-private',
].join(' ');

function getRedirectUri() {
  return window.location.origin + '/';
}

function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const vals = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(vals, v => chars[v % chars.length]).join('');
}

async function sha256base64url(plain) {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function initiateLogin() {
  if (!CLIENT_ID) return false;
  const verifier = randomString(64);
  const challenge = await sha256base64url(verifier);
  localStorage.setItem('spotify_verifier', verifier);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: getRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  return true;
}

export async function handleCallback(code) {
  const verifier = localStorage.getItem('spotify_verifier');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || 'Token exchange failed');
  localStorage.setItem('spotify_token', data.access_token);
  localStorage.setItem('spotify_refresh', data.refresh_token);
  localStorage.setItem('spotify_expiry', Date.now() + data.expires_in * 1000);
  return data.access_token;
}

export async function refreshToken() {
  const refresh = localStorage.getItem('spotify_refresh');
  if (!refresh) return null;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  const data = await res.json();
  if (!data.access_token) return null;
  localStorage.setItem('spotify_token', data.access_token);
  localStorage.setItem('spotify_expiry', Date.now() + data.expires_in * 1000);
  if (data.refresh_token) localStorage.setItem('spotify_refresh', data.refresh_token);
  return data.access_token;
}

export async function getToken() {
  const token = localStorage.getItem('spotify_token');
  const expiry = parseInt(localStorage.getItem('spotify_expiry') || '0');
  if (!token) return null;
  if (Date.now() > expiry - 60000) return refreshToken();
  return token;
}

export function isConnected() {
  return !!localStorage.getItem('spotify_token');
}

export function disconnect() {
  localStorage.removeItem('spotify_token');
  localStorage.removeItem('spotify_refresh');
  localStorage.removeItem('spotify_expiry');
  localStorage.removeItem('spotify_verifier');
}

async function api(path, method = 'GET', body = null) {
  const token = await getToken();
  if (!token) throw new Error('Not connected to Spotify');
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(`https://api.spotify.com/v1${path}`, opts);
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  return res.json();
}

export async function getCurrentlyPlaying() {
  try { return await api('/me/player/currently-playing'); } catch { return null; }
}

export async function play() { await api('/me/player/play', 'PUT'); }
export async function pause() { await api('/me/player/pause', 'PUT'); }
export async function next() { await api('/me/player/next', 'POST'); }
export async function previous() { await api('/me/player/previous', 'POST'); }

export async function searchAndPlay(query) {
  const data = await api(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
  const uri = data?.tracks?.items?.[0]?.uri;
  if (!uri) return null;
  await api('/me/player/play', 'PUT', { uris: [uri] });
  return data.tracks.items[0];
}
