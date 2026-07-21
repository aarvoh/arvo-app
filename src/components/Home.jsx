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

const NOTIF_APPS = [
  { name: 'WhatsApp',  color: '#25D366' },
  { name: 'Instagram', color: '#E1306C' },
  { name: 'Gmail',     color: '#EA4335' },
  { name: 'Messenger', color: '#0099FF' },
  { name: 'Telegram',  color: '#2AABEE' },
  { name: 'Snapchat',  color: '#FFFC00' },
];

export default function Home({ onOpenSettings, onOpenActivity, onNavigate, spotifyConnected }) {
  const time = useLiveClock();

  const [weather,     setWeather]     = useState(null);
  const [hourly,      setHourly]      = useState([]);
  const [city,        setCity]        = useState('');
  const [glassLive,   setGlassLive]   = useState(false);
  const [notifApp,    setNotifApp]    = useState('WhatsApp');
  const [notifSender, setNotifSender] = useState('');
  const [notifMsg,    setNotifMsg]    = useState('');
  const [notifSent,   setNotifSent]   = useState(false);
  const [recentItems, setRecentItems] = useState([]);
  const [todayCount,  setTodayCount]  = useState(0);
  const [nowPlaying,  setNowPlaying]  = useState(null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [battery,     setBattery]     = useState(null);
  const [callStatus,  setCallStatus]  = useState(null); // { text, color }
  const glassPingTimer     = useRef(null);
  const callStatusTimer    = useRef(null);
  const lastMusicBroadcast = useRef({ track: null, playing: null });

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
    if (!navigator.getBattery) return;
    navigator.getBattery().then(bat => {
      setBattery(Math.round(bat.level * 100));
      bat.onlevelchange = () => setBattery(Math.round(bat.level * 100));
    });
  }, []);

  function showCallBanner(text, color) {
    setCallStatus({ text, color });
    clearTimeout(callStatusTimer.current);
    callStatusTimer.current = setTimeout(() => setCallStatus(null), 4000);
  }

  useEffect(() => {
    if (!glassChannel) return;
    function handle(e) {
      const msg = e.data;
      if (msg?.type === 'heartbeat_glass') {
        setGlassLive(true);
        clearTimeout(glassPingTimer.current);
        glassPingTimer.current = setTimeout(() => setGlassLive(false), 8000);
      }
      if (msg?.type === 'glass_query') setTimeout(loadRecent, 300);
      if (msg?.type === 'call_answer')  showCallBanner(`Call connected · ${msg.caller || ''}`, '#34D399');
      if (msg?.type === 'call_declined') showCallBanner('Call declined', '#EF4444');
      if (msg?.type === 'call_ended')   showCallBanner('Call ended', '#6b7280');
    }
    glassChannel.addEventListener('message', handle);
    return () => {
      glassChannel.removeEventListener('message', handle);
      clearTimeout(glassPingTimer.current);
      clearTimeout(callStatusTimer.current);
    };
  }, []);

  // Keep glass status bar showing phone as live while Home screen is open
  useEffect(() => {
    if (!glassChannel) return;
    glassChannel.postMessage({ type: 'heartbeat_phone' });
    const id = setInterval(() => glassChannel.postMessage({ type: 'heartbeat_phone' }), 4000);
    return () => clearInterval(id);
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
      if (data?.item) {
        setNowPlaying(data.item);
        setIsPlaying(data.is_playing);
        // Broadcast to glass only when track or playing state changes
        const track   = data.item.name;
        const playing = data.is_playing;
        const last    = lastMusicBroadcast.current;
        if (last.track !== track || last.playing !== playing) {
          lastMusicBroadcast.current = { track, playing };
          glassChannel?.postMessage({
            type: 'music_update',
            playing,
            track,
            artist:   data.item.artists.map(a => a.name).join(', '),
            albumArt: data.item.album.images[0]?.url || null,
          });
        }
      } else {
        if (lastMusicBroadcast.current.playing !== false) {
          lastMusicBroadcast.current = { track: null, playing: false };
          glassChannel?.postMessage({ type: 'music_update', playing: false });
        }
        setNowPlaying(null);
        setIsPlaying(false);
      }
    }
    poll(); const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [spotifyConnected]);

  function sendNotifToGlass() {
    if (!notifMsg.trim()) return;
    glassChannel?.postMessage({
      type: 'notification',
      app: notifApp,
      sender: notifSender.trim() || 'Someone',
      preview: notifMsg.trim(),
    });
    setNotifMsg(''); setNotifSender('');
    setNotifSent(true);
    setTimeout(() => setNotifSent(false), 2000);
  }

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
          {battery !== null && <span className="mono">{battery}%</span>}
        </div>
      </div>

      <div className="home-top-bar">
        <div className={`wordmark${glassLive ? ' glass-live' : ''}`}>ARVO <span className="ch">A1</span></div>
        <div className={`glass-top-badge${glassLive ? ' live' : ''}`}>
          <span className="glass-chip-dot" />
          {glassLive ? 'Glass live' : 'Standby'}
        </div>
      </div>

      <div className="home-scroll">

        {/* ── Greeting ── */}
        <div className="greeting-block">
          <div className="greeting-date">{dateStr}</div>
          <div className="greeting-text">{greeting}</div>
        </div>


        {/* ── Weather hero card ── */}
        <div className="weather-hero-wrap">
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
        </div>


        {/* ── Glass status card ── */}
        {glassLive ? (
          <div className="glass-status-card live">
            <div className="gsc-body">
              <div className="gsc-title-row">
                <span className="gsc-dot" />
                ARVO A1
                <span className="gsc-live-tag">live</span>
              </div>
              <div className="gsc-sub">Streaming to display</div>
              <div className="gsc-services">
                Maps <span className="sep">·</span> Music <span className="sep">·</span> AI active
              </div>
            </div>
            <div className="gsc-glyph">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 10c0-1.1.9-2 2-2h16a2 2 0 0 1 2 2v1"/>
                <path d="M2 10v2.5A2.5 2.5 0 0 0 4.5 15h3A2.5 2.5 0 0 0 10 12.5V11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5a2.5 2.5 0 0 0 2.5 2.5h3a2.5 2.5 0 0 0 2.5-2.5V10"/>
              </svg>
            </div>
          </div>
        ) : (
          <div className="glass-standby-hero" onClick={() => window.open('/glass', '_blank')}>
            <div className="gsh-header">
              <div>
                <div className="gsh-name">ARVO A1</div>
                <div className="gsh-model">Smart Glasses · Gen 1</div>
              </div>
              <div className="gsh-badge">
                <span className="gsh-badge-dot" />
                Standby
              </div>
            </div>
            <div className="gsh-visual">
              <div className="gsh-scan" />
              <svg className="gsh-svg" viewBox="0 0 280 76" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 38 L4 44" stroke="rgba(190,205,255,0.3)" strokeWidth="3" strokeLinecap="round"/>
                <rect x="20" y="12" width="100" height="52" rx="16" stroke="rgba(170,195,255,0.5)" strokeWidth="2" fill="rgba(60,90,255,0.05)"/>
                <path d="M120 38 C 120 26, 160 26, 160 38" stroke="rgba(190,205,255,0.35)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <rect x="160" y="12" width="100" height="52" rx="16" stroke="rgba(170,195,255,0.5)" strokeWidth="2" fill="rgba(60,90,255,0.05)"/>
                <path d="M260 38 L276 44" stroke="rgba(190,205,255,0.3)" strokeWidth="3" strokeLinecap="round"/>
                <path d="M32 24 Q52 18 68 23" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M172 24 Q192 18 208 23" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="70" cy="38" r="5" fill="rgba(80,130,255,0.3)"/>
                <circle cx="70" cy="38" r="2.5" fill="rgba(130,170,255,0.55)"/>
                <circle cx="210" cy="38" r="5" fill="rgba(80,130,255,0.3)"/>
                <circle cx="210" cy="38" r="2.5" fill="rgba(130,170,255,0.55)"/>
              </svg>
              <div className="gsh-glow" />
            </div>
            <div className="gsh-footer">
              <div>
                <div className="gsh-footer-title">Display offline</div>
                <div className="gsh-footer-sub">Open glass interface to activate lens</div>
              </div>
              <div className="gsh-launch-btn">
                Launch
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* ── Quick actions ── */}
        <div className="section-heading">
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

        {/* ── Send notification to glass ── */}
        <div className="section-heading" style={{ marginTop: 24 }}>
          <span>SEND TO GLASS</span>
        </div>
        <div className="notif-composer">
          <div className="nc-app-row">
            {NOTIF_APPS.map(a => (
              <button key={a.name} className={`nc-app-btn${notifApp === a.name ? ' active' : ''}`}
                style={{ '--na-color': a.color }}
                onClick={() => setNotifApp(a.name)}>
                {a.name}
              </button>
            ))}
          </div>
          <input className="nc-input" placeholder="Sender name (e.g. Priya)"
            value={notifSender} onChange={e => setNotifSender(e.target.value)} />
          <div className="nc-msg-row">
            <input className="nc-input nc-msg-input" placeholder="Message preview…"
              value={notifMsg} onChange={e => setNotifMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendNotifToGlass(); }} />
            <button className={`nc-send-btn${notifSent ? ' sent' : ''}`}
              onClick={sendNotifToGlass} disabled={!notifMsg.trim()}>
              {notifSent
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              }
            </button>
          </div>
          {!glassLive && (
            <div className="nc-hint">Glass must be open to receive notifications</div>
          )}
        </div>

        {/* ── Live demo scenarios ── */}
        <div className="section-heading" style={{ marginTop: 24 }}>
          <span>SIMULATE ON GLASS</span>
          {callStatus && (
            <span style={{ fontSize:11, fontWeight:600, color: callStatus.color, marginLeft:'auto' }}>
              {callStatus.text}
            </span>
          )}
        </div>
        <div className="quick-list">

          {/* Incoming call */}
          <button className="quick-row" onClick={() => glassChannel?.postMessage({ type:'call_start', caller:'Priya', app:'WhatsApp' })}>
            <div className="qr-icon" style={{ background:'rgba(37,211,102,0.12)', color:'#25D366' }}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">Incoming call · Priya</div>
              <div className="qr-sub">WhatsApp · say "accept" or "decline" on glass</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* WhatsApp message */}
          <button className="quick-row" onClick={() => glassChannel?.postMessage({ type:'notification', app:'WhatsApp', sender:'Priya', preview:'Are you coming tonight? 🎉' })}>
            <div className="qr-icon" style={{ background:'rgba(37,211,102,0.12)', color:'#25D366' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">WhatsApp · Priya</div>
              <div className="qr-sub">Are you coming tonight? 🎉</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* Instagram DM */}
          <button className="quick-row" onClick={() => glassChannel?.postMessage({ type:'notification', app:'Instagram', sender:'Rahul', preview:'Liked your photo.' })}>
            <div className="qr-icon" style={{ background:'rgba(225,48,108,0.12)', color:'#E1306C' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">Instagram · Rahul</div>
              <div className="qr-sub">Liked your photo.</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* Gmail */}
          <button className="quick-row" onClick={() => glassChannel?.postMessage({ type:'notification', app:'Gmail', sender:'Harsha from Google', preview:'Your weekly activity summary is ready.' })}>
            <div className="qr-icon" style={{ background:'rgba(234,67,53,0.12)', color:'#EA4335' }}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.908 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">Gmail · Google</div>
              <div className="qr-sub">Your weekly activity summary is ready.</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* Navigation */}
          <button className="quick-row" onClick={() => glassChannel?.postMessage({ type:'nav_start', instruction:'Head north', street:'MG Road', distance:'1.2 km', dest:'Kempegowda International Airport', eta:'45 min' })}>
            <div className="qr-icon sage">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            </div>
            <div className="qr-body">
              <div className="qr-label">Navigate · Airport</div>
              <div className="qr-sub">45 min · Turn-by-turn on glass</div>
            </div>
            <svg className="qr-arrow" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>

        </div>

        {/* ── Recent glass activity ── */}
        <div className="recent-section" style={{ marginTop: 24 }}>
          <div className="section-heading">
            <span>RECENT</span>
            {recentItems.length > 0 && (
              <button className="section-see-all" onClick={onOpenActivity}>
                {todayCount > 0 ? `${todayCount} today · ` : ''}see all
              </button>
            )}
          </div>
          {recentItems.length > 0 ? recentItems.map((item, i) => (
            <div key={i} className={`recent-item accent-${KIND_COLOR[item.kind] || 'blue'}`} onClick={onOpenActivity}>
              <div className={`recent-kind-pill ${KIND_COLOR[item.kind] || 'blue'}`}>
                {KIND_LABEL[item.kind] || 'AI'}
              </div>
              <div className="recent-item-body">
                <div className="recent-item-cmd">{(item.cmd || '').replace(/^"|"$/g, '')}</div>
                <div className="recent-item-answer">{item.answer}</div>
              </div>
              <div className="recent-item-time">{relTime(item.ts)}</div>
            </div>
          )) : (
            <div className="recents-empty">
              <div className="recents-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </div>
              <div className="recents-empty-body">
                <div className="recents-empty-title">Say "Hey ARVO" to get started</div>
                <div className="recents-empty-sub">Your glass activity appears here</div>
              </div>
            </div>
          )}
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


      </div>
    </div>
  );
}
