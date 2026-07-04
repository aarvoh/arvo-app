import { useState, useEffect, useRef } from 'react';
import useLiveClock from '../hooks/useLiveClock';
import { getCurrentlyPlaying, play, pause, next } from '../lib/spotify';
import glassChannel from '../lib/glassChannel';

const WMO_ICON = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌧️',55:'🌧️',61:'🌧️',63:'🌧️',65:'⛈️',
  71:'🌨️',73:'❄️',75:'❄️',80:'🌦️',81:'🌦️',82:'⛈️',95:'⛈️',
};
const WMO_LABEL = {
  0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',
  45:'Foggy',48:'Foggy',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',
  75:'Heavy snow',80:'Showers',81:'Showers',82:'Heavy showers',95:'Thunderstorm',
};
const KIND_COLOR = { ai:'blue', typed:'blue', vision:'blue', nav:'sage', music:'sage' };
const KIND_LABEL = { ai:'AI', typed:'AI', vision:'Vision', nav:'Nav', music:'Music' };

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function relTime(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
}

export default function Home({ onOpenSettings, onOpenActivity, onNavigate, spotifyConnected }) {
  const time = useLiveClock();

  const [weather,     setWeather]     = useState(null);
  const [hourly,      setHourly]      = useState([]);
  const [city,        setCity]        = useState('');
  const [glassLive,   setGlassLive]   = useState(false);
  const [recentItems, setRecentItems] = useState([]);
  const [todayCount,  setTodayCount]  = useState(0);
  const [nowPlaying,  setNowPlaying]  = useState(null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const glassPingTimer = useRef(null);

  const savedName = localStorage.getItem('arvo_user_name');
  const greeting  = `${getGreeting()}${savedName ? `, ${savedName}` : ''}`;
  const dateStr   = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

  function loadRecent() {
    try {
      const raw = localStorage.getItem('arvo_activity_v1');
      if (!raw) return;
      const entries = JSON.parse(raw);
      const today   = new Date();
      const isToday = ts => { const d = new Date(ts); return d.getDate()===today.getDate() && d.getMonth()===today.getMonth(); };
      setTodayCount(entries.filter(e => isToday(e.ts)).length);
      setRecentItems(entries.filter(e => ['ai','vision','typed','nav','music'].includes(e.kind) && e.answer).slice(0, 3));
    } catch {}
  }
  useEffect(() => { loadRecent(); }, []);

  useEffect(() => {
    if (!glassChannel) return;
    function handle(e) {
      if (e.data?.type === 'heartbeat_glass') {
        setGlassLive(true);
        clearTimeout(glassPingTimer.current);
        glassPingTimer.current = setTimeout(() => setGlassLive(false), 8000);
      }
      if (e.data?.type === 'glass_query') setTimeout(loadRecent, 300);
    }
    glassChannel.addEventListener('message', handle);
    return () => { glassChannel.removeEventListener('message', handle); clearTimeout(glassPingTimer.current); };
  }, []);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        const [wr, nr] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m&hourly=temperature_2m,weathercode&forecast_days=1&timezone=auto`),
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers:{ 'Accept-Language':'en' } }),
        ]);
        const wd = await wr.json(); const nd = await nr.json();
        setWeather(wd.current);
        setCity(nd.address?.city || nd.address?.town || nd.address?.village || '');
        if (wd.hourly?.time) {
          const nowH = new Date().getHours();
          const idx  = Math.max(0, wd.hourly.time.findIndex(t => new Date(t).getHours() >= nowH));
          setHourly(wd.hourly.time.slice(idx, idx + 7).map((t, i) => ({
            hour: new Date(t).toLocaleTimeString('en-US', { hour:'numeric', hour12:true }),
            temp: Math.round(wd.hourly.temperature_2m[idx + i]),
            code: wd.hourly.weathercode[idx + i],
          })));
        }
      } catch {}
    });
  }, []);

  useEffect(() => {
    if (!spotifyConnected) return;
    let cancelled = false;
    async function poll() {
      const data = await getCurrentlyPlaying();
      if (cancelled) return;
      if (data?.item) { setNowPlaying(data.item); setIsPlaying(data.is_playing); } else setNowPlaying(null);
    }
    poll(); const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [spotifyConnected]);

  async function togglePlay() { if (isPlaying) { await pause(); setIsPlaying(false); } else { await play(); setIsPlaying(true); } }
  async function skipNext() {
    await next();
    setTimeout(async () => { const d = await getCurrentlyPlaying(); if (d?.item) { setNowPlaying(d.item); setIsPlaying(true); } }, 800);
  }

  const wIcon  = weather ? (WMO_ICON[weather.weathercode]  ?? '🌡️') : null;
  const wLabel = weather ? (WMO_LABEL[weather.weathercode] ?? '')    : null;

  return (
    <div className="view active">
      <div className="status-bar">
        <span>{time}</span>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {weather && <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--paper-dim)' }}>{wIcon} {Math.round(weather.temperature_2m)}°</span>}
          <span className="mono">93%</span>
        </div>
      </div>

      <div className="home-top-bar">
        <div className="wordmark">ARVO <span className="ch">A1</span></div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div className={`glass-top-badge${glassLive ? ' live' : ''}`}>
            <span className="glass-chip-dot" />
            {glassLive ? 'Glass live' : 'Standby'}
          </div>
          <div className="icon-btn" onClick={onOpenSettings}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
        </div>
      </div>

      <div className="home-scroll">

        {/* ── Greeting ── */}
        <div className="greeting-block">
          <div className="greeting-text">{greeting}</div>
          <div className="greeting-date">{dateStr}</div>
        </div>


        {/* ── Weather card ── */}
        {weather ? (
          <div className="weather-card">
            <div className="weather-main-row">
              <div>
                <div className="weather-temp-large">{Math.round(weather.temperature_2m)}°</div>
                <div className="weather-condition-text">{wLabel}{city ? ` · ${city}` : ''}</div>
                <div className="weather-feels-text">
                  Feels like {Math.round(weather.apparent_temperature)}° · Wind {Math.round(weather.windspeed_10m)} km/h
                </div>
              </div>
              <div className="weather-icon-large">{wIcon}</div>
            </div>
            {hourly.length > 0 && (
              <div className="hourly-strip">
                {hourly.map((h, i) => (
                  <div key={i} className={`hourly-item${i === 0 ? ' now' : ''}`}>
                    <div className="hourly-time">{i === 0 ? 'Now' : h.hour}</div>
                    <div className="hourly-icon">{WMO_ICON[h.code] ?? '🌡️'}</div>
                    <div className="hourly-temp">{h.temp}°</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="weather-card weather-loading">
            <span className="spinner" style={{ width:14, height:14, borderColor:'rgba(255,255,255,0.08)', borderTopColor:'rgba(255,255,255,0.35)' }} />
            <span style={{ fontSize:13, color:'var(--paper-faint)' }}>Loading weather…</span>
          </div>
        )}


        {/* ── Recent glass activity ── */}
        {recentItems.length > 0 && (
          <div className="recent-section">
            <div className="section-heading">
              <span>RECENT</span>
              <button className="section-see-all" onClick={onOpenActivity}>
                {todayCount > 0 ? `${todayCount} today · ` : ''}see all
              </button>
            </div>
            {recentItems.map((item, i) => (
              <div key={i} className="recent-item" onClick={onOpenActivity}>
                <div className={`recent-kind-pill ${KIND_COLOR[item.kind] || 'blue'}`}>
                  {KIND_LABEL[item.kind] || 'AI'}
                </div>
                <div className="recent-item-body">
                  <div className="recent-item-cmd">{(item.cmd || '').replace(/^"|"$/g, '')}</div>
                  <div className="recent-item-answer">{item.answer}</div>
                </div>
                <div className="recent-item-time">{relTime(item.ts)}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Quick actions ── */}
        <div className="section-heading" style={{ marginTop: recentItems.length ? 20 : 8 }}>
          <span>QUICK ACTIONS</span>
        </div>
        <div className="quick-list">
          <button className="quick-row" onClick={onOpenActivity}>
            <div className="qr-icon blue">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">What do I see?</div>
              <div className="qr-sub">Point camera · ARVO describes</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="quick-row" onClick={() => onNavigate('maps')}>
            <div className="qr-icon sage">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">Navigate</div>
              <div className="qr-sub">Maps · Turn-by-turn on glass</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="quick-row" onClick={onOpenActivity}>
            <div className="qr-icon brass">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">Play music</div>
              <div className="qr-sub">Voice command · Spotify</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="quick-row" onClick={onOpenActivity}>
            <div className="qr-icon neutral">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">Ask ARVO</div>
              <div className="qr-sub">Say "Hey ARVO" anytime</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {/* ── Now playing / Spotify connect ── */}
        {spotifyConnected && nowPlaying ? (
          <div className="now-playing-widget">
            {nowPlaying.album?.images?.[0]?.url && (
              <img className="np-art" src={nowPlaying.album.images[0].url} alt="album art" />
            )}
            <div className="np-info">
              <div className="np-track">{nowPlaying.name}</div>
              <div className="np-artist">{nowPlaying.artists?.map(a => a.name).join(', ')}</div>
            </div>
            <div className="np-controls">
              <button className="np-btn" onClick={togglePlay}>
                {isPlaying
                  ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
              </button>
              <button className="np-btn" onClick={skipNext}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
              </button>
            </div>
          </div>
        ) : !spotifyConnected ? (
          <div className="connect-prompt" onClick={() => onNavigate('settings')}>
            <div className="connect-prompt-icon">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M7 15c3-1 7-1 10 1M7.5 12c3-1 6.5-1 9 0.8M8 9c2.5-0.7 5.5-0.7 8 0.7"/></svg>
            </div>
            <div className="connect-prompt-body">
              <div className="connect-prompt-title">Connect Spotify</div>
              <div className="connect-prompt-sub">Control music from your glass by voice</div>
            </div>
            <span className="connect-prompt-cta">Connect →</span>
          </div>
        ) : null}

        {/* ── Pull hint ── */}
        <div className="pull-hint-static" onClick={onOpenActivity} style={{ cursor:'pointer', marginTop:20 }}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          {todayCount > 0
            ? <span><strong>{todayCount}</strong> glass actions today · pull to view</span>
            : 'pull down anytime for glass activity'
          }
        </div>

      </div>
    </div>
  );
}
