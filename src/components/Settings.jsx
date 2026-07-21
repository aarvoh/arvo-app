import { useState, useEffect, useRef } from 'react';
import useLiveClock from '../hooks/useLiveClock';
import { initiateLogin, disconnect } from '../lib/spotify';
import glassChannel from '../lib/glassChannel';

const LANGS = ['English (IN)', 'English (US)', 'Hindi', 'Kannada', 'Tamil', 'Telugu'];
const VERBOSITY = ['Brief', 'Balanced', 'Detailed'];

function countTodayActivity() {
  try {
    const raw = localStorage.getItem('arvo_activity_v1');
    if (!raw) return 0;
    const today = new Date();
    return JSON.parse(raw).filter(e => {
      const d = new Date(e.ts);
      return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
    }).length;
  } catch { return 0; }
}


export default function Settings({ spotifyConnected, onSpotifyChange }) {
  const time = useLiveClock();
  const todayCount = countTodayActivity();
  const [battery,     setBattery]     = useState(null);
  const [callStatus,  setCallStatus]  = useState(null);
  const [demoOpen,    setDemoOpen]    = useState(false);
  const callStatusTimer = useRef(null);

  function showCallBanner(text, color) {
    setCallStatus({ text, color });
    clearTimeout(callStatusTimer.current);
    callStatusTimer.current = setTimeout(() => setCallStatus(null), 4000);
  }

  useEffect(() => {
    if (!glassChannel) return;
    function handle(e) {
      const msg = e.data;
      if (msg?.type === 'call_answer')   showCallBanner(`✓ Call connected · ${msg.caller || ''}`, '#34D399');
      if (msg?.type === 'call_declined') showCallBanner('✕ Call declined', '#EF4444');
      if (msg?.type === 'call_ended')    showCallBanner('Call ended', '#6b7280');
    }
    glassChannel.addEventListener('message', handle);
    return () => { glassChannel.removeEventListener('message', handle); clearTimeout(callStatusTimer.current); };
  }, []);

  useEffect(() => {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(b => {
      setBattery(Math.round(b.level * 100));
      b.addEventListener('levelchange', () => setBattery(Math.round(b.level * 100)));
    });
  }, []);

  const [streamOn,      setStreamOn]      = useState(true);
  const [brightness,    setBrightness]    = useState(70);
  const [langIdx,       setLangIdx]       = useState(0);
  const [verbIdx,       setVerbIdx]       = useState(1);
  const [callAlerts,    setCallAlerts]    = useState(true);
  const [msgPreview,    setMsgPreview]    = useState(true);
  const [navAlerts,     setNavAlerts]     = useState(true);
  const [autoWake,      setAutoWake]      = useState(false);
  const [alwaysClock,   setAlwaysClock]   = useState(true);
  const [calibrating,   setCalibrating]   = useState(false);
  const [calibDone,     setCalibDone]     = useState(false);
  const [apiStatus,     setApiStatus]     = useState('unknown'); // 'unknown'|'ok'|'error'|'testing'
  const [apiTesting,    setApiTesting]    = useState(false);
  const [userName,      setUserName]      = useState(() => localStorage.getItem('arvo_user_name') || 'Harsha');
  const [editingName,   setEditingName]   = useState(false);

  // test API on mount
  useState(() => {
    fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
    }).then(r => r.json()).then(d => {
      setApiStatus(d.content?.includes('ANTHROPIC_API_KEY') ? 'error' : 'ok');
    }).catch(() => setApiStatus('error'));
  });

  async function testApi() {
    setApiTesting(true); setApiStatus('testing');
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Reply with just: ok' }] }),
      });
      const d = await r.json();
      setApiStatus(d.content?.toLowerCase().includes('api_key') || d.content?.includes('ANTHROPIC') ? 'error' : 'ok');
    } catch { setApiStatus('error'); }
    setApiTesting(false);
  }

  function saveName(name) {
    const trimmed = name.trim() || 'Harsha';
    setUserName(trimmed);
    localStorage.setItem('arvo_user_name', trimmed);
    setEditingName(false);
  }

  async function handleSpotifyToggle() {
    if (spotifyConnected) {
      disconnect();
      onSpotifyChange(false);
    } else {
      const hasClientId = !!import.meta.env.VITE_SPOTIFY_CLIENT_ID;
      if (!hasClientId) {
        alert('Add your VITE_SPOTIFY_CLIENT_ID to the .env file first.\n\nGet a free Client ID at developer.spotify.com → Create App');
        return;
      }
      await initiateLogin();
    }
  }

  function startCalib() {
    setCalibrating(true);
    setCalibDone(false);
    setTimeout(() => { setCalibrating(false); setCalibDone(true); }, 2200);
  }

  return (
    <div className="view active">
      <div className="status-bar"><span>{time}</span>{battery !== null && <span className="mono">{battery}%</span>}</div>

      <div className="settings-top-bar">
        <div className="top-title">Settings</div>
      </div>

      <div className="settings-content">

        {/* ── Profile card ─────────────────────────────── */}
        <div className="profile-card">
          <div className="profile-avatar">{userName.charAt(0).toUpperCase()}</div>
          <div className="profile-info">
            {editingName ? (
              <input
                className="profile-name-input"
                defaultValue={userName}
                autoFocus
                onBlur={e => saveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(e.target.value); if (e.key === 'Escape') setEditingName(false); }}
              />
            ) : (
              <div className="profile-name" onClick={() => setEditingName(true)} style={{ cursor:'pointer' }}>
                {userName} <span style={{ fontSize:11, color:'var(--paper-faint)', fontWeight:400 }}>tap to edit</span>
              </div>
            )}
            <div className="profile-email">harshasbgowda578@gmail.com</div>
          </div>
          <div className="profile-badge">Owner</div>
        </div>

        {/* ── Glass connection guide ────────────────────── */}
        <div className="section">
          <div className="section-label">HOW TO CONNECT GLASS</div>
          <div className="glass-connect-card">
            <div className="glass-steps">
              <div className="glass-step">
                <div className="glass-step-num">1</div>
                <div className="glass-step-text">Open the Glass HUD in a new tab on the same device</div>
              </div>
              <div className="glass-step">
                <div className="glass-step-num">2</div>
                <div className="glass-step-text">Keep both this tab and the Glass tab open at the same time</div>
              </div>
              <div className="glass-step">
                <div className="glass-step-num">3</div>
                <div className="glass-step-text">Say <strong style={{ color:'var(--blue-bright)' }}>"Hey ARVO"</strong> in the Glass tab to activate voice</div>
              </div>
            </div>
            <button className="open-glass-btn" onClick={() => window.open('/glass', '_blank')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
              Open Glass HUD
            </button>
          </div>
        </div>

        {/* ── Connected services ───────────────────────── */}
        <div className="section">
          <div className="section-label">CONNECTED SERVICES</div>
          <div className="group">

            <div className="row">
              <div className={`row-icon ${spotifyConnected ? 'sage' : 'neutral'}`}>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M7 15c3-1 7-1 10 1M7.5 12c3-1 6.5-1 9 0.8M8 9c2.5-0.7 5.5-0.7 8 0.7"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Spotify</div>
                <div className="row-sub">{spotifyConnected ? 'Connected · play/pause/skip by voice' : 'Connect to control music by voice'}</div>
              </div>
              <div className={`switch ${spotifyConnected ? 'on' : 'off'}`} onClick={handleSpotifyToggle}>
                <div className="switch-knob" />
              </div>
            </div>

            <div className="row svc-pending">
              <div className="row-icon neutral">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 1 1-3.8-7.1M21 11.5L17 10l1.2-3.6"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">WhatsApp</div>
                <div className="row-sub">Requires WhatsApp Business API + Meta Business Verification</div>
              </div>
              <div className="pending-pill-small">soon</div>
            </div>

            <div className="row svc-pending">
              <div className="row-icon neutral">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">YouTube</div>
                <div className="row-sub">Play and control videos by voice on your glass</div>
              </div>
              <div className="pending-pill-small">soon</div>
            </div>

            <div className="row svc-pending">
              <div className="row-icon neutral">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3L9.218 10.083M11.698 20.334L22 3.001H2l9.698 17.333zM9.218 10.083L11.698 20.334"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Telegram</div>
                <div className="row-sub">Receive messages and reply by voice from your glass</div>
              </div>
              <div className="pending-pill-small">soon</div>
            </div>

            <div className="row svc-pending">
              <div className="row-icon neutral">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Instagram</div>
                <div className="row-sub">Post stories directly from your glass lens to Instagram</div>
              </div>
              <div className="pending-pill-small">soon</div>
            </div>

          </div>
        </div>

        {/* ── Voice & language ─────────────────────────── */}
        <div className="section">
          <div className="section-label">VOICE &amp; LANGUAGE</div>
          <div className="group">

            <div className="row" style={{ cursor: 'pointer' }} onClick={() => setLangIdx((langIdx + 1) % LANGS.length)}>
              <div className="row-icon blue">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a14.5 14.5 0 0 1 0 18M3 12h18"/><path d="M3.6 7.5h16.8M3.6 16.5h16.8"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Recognition language</div>
                <div className="row-sub">Tap to cycle options</div>
              </div>
              <div className="row-value">{LANGS[langIdx]}</div>
            </div>

            <div className="row" style={{ cursor: 'pointer' }} onClick={() => setVerbIdx((verbIdx + 1) % VERBOSITY.length)}>
              <div className="row-icon blue">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Response verbosity</div>
                <div className="row-sub">How much detail AI speaks back</div>
              </div>
              <div className="row-value">{VERBOSITY[verbIdx]}</div>
            </div>

          </div>
        </div>

        {/* ── Notifications ────────────────────────────── */}
        <div className="section">
          <div className="section-label">NOTIFICATIONS ON LENS</div>
          <div className="group">

            <div className="row">
              <div className="row-icon brass">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Incoming calls</div>
                <div className="row-sub">Caller name shown as HUD overlay</div>
              </div>
              <div className={`switch ${callAlerts ? 'on' : 'off'}`} onClick={() => setCallAlerts(v => !v)}>
                <div className="switch-knob" />
              </div>
            </div>

            <div className="row">
              <div className="row-icon brass">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Message preview</div>
                <div className="row-sub">First line of messages on lens</div>
              </div>
              <div className={`switch ${msgPreview ? 'on' : 'off'}`} onClick={() => setMsgPreview(v => !v)}>
                <div className="switch-knob" />
              </div>
            </div>

            <div className="row">
              <div className="row-icon brass">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5 1.5L5 16 16 5l3 3L8 19"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Navigation turns</div>
                <div className="row-sub">Next turn shown 300m in advance</div>
              </div>
              <div className={`switch ${navAlerts ? 'on' : 'off'}`} onClick={() => setNavAlerts(v => !v)}>
                <div className="switch-knob" />
              </div>
            </div>

          </div>
        </div>

        {/* ── AI assistant ─────────────────────────────── */}
        <div className="section">
          <div className="section-label">AI ASSISTANT</div>
          <div className="group">
            <div className="row">
              <div className={`row-icon ${apiStatus === 'ok' ? 'blue' : apiStatus === 'error' ? 'red' : 'neutral'}`}>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 8v4l3 3"/><circle cx="19" cy="5" r="3" fill="currentColor"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Claude · Haiku 4.5</div>
                <div className="row-sub">
                  {apiStatus === 'ok'      && (todayCount > 0 ? `✓ Connected · ${todayCount} queries today` : '✓ Connected · ready')}
                  {apiStatus === 'error'   && '✗ API key missing or invalid — check .env'}
                  {apiStatus === 'testing' && 'Testing connection…'}
                  {apiStatus === 'unknown' && 'Vision + voice on lens and phone'}
                </div>
              </div>
              <button className="api-test-btn" onClick={testApi} disabled={apiTesting}>
                {apiTesting ? <span className="spinner" style={{ width:11, height:11, borderColor:'rgba(255,255,255,0.2)', borderTopColor:'#fff' }} /> : apiStatus === 'ok' ? '✓' : 'Test'}
              </button>
            </div>

            {apiStatus === 'error' && (
              <div className="api-error-box">
                <div className="api-error-title">How to fix</div>
                <div className="api-error-step">1. Open <code>.env</code> in the project folder</div>
                <div className="api-error-step">2. Add: <code>ANTHROPIC_API_KEY=sk-ant-...</code></div>
                <div className="api-error-step">3. Restart the dev server (<code>npx vite</code>)</div>
                <div className="api-error-step" style={{ marginTop:6, color:'var(--paper-faint)' }}>Get a free key at console.anthropic.com</div>
              </div>
            )}

            <div className="row">
              <div className="row-icon blue">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div className="row-main">
                <div className="row-title">Auto-describe on scan</div>
                <div className="row-sub">Describes what you see automatically</div>
              </div>
              <div className="switch on"><div className="switch-knob" /></div>
            </div>
          </div>
        </div>

        {/* ── Calibration ──────────────────────────────── */}
        <div className="section">
          <div className="section-label">CALIBRATION</div>
          <div className="calibrate-cta">
            <div>
              <div className="calibrate-text-title">Re-run calibration</div>
              <div className="calibrate-text-sub">
                {calibDone ? '✓ Done just now · next in 30 days' : 'Takes ~2 min · last run 14 days ago'}
              </div>
            </div>
            <button className={`calibrate-btn${calibrating ? ' calibrating' : ''}`} onClick={startCalib} disabled={calibrating}>
              {calibrating ? <><span className="spinner" style={{ width: 12, height: 12, borderColor: 'rgba(0,0,0,0.2)', borderTopColor: '#07080A', flexShrink: 0 }} /> Running…</> : calibDone ? 'Done ✓' : 'Start'}
            </button>
          </div>
        </div>

        {/* ── Glass behavior ───────────────────────────── */}
        <div className="section">
          <div className="section-label">GLASS BEHAVIOR</div>
          <div className="group">

            <div className="row">
              <div className="row-icon sage">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5 1.5L5 16 16 5l3 3L8 19"/></svg>
              </div>
              <div className="row-main"><div className="row-title">Stream navigation to lens</div><div className="row-sub">Turn-by-turn always on HUD when connected</div></div>
              <div className={`switch ${streamOn ? 'on' : 'off'}`} onClick={() => setStreamOn(v => !v)}>
                <div className="switch-knob" />
              </div>
            </div>

            <div className="row">
              <div className="row-icon sage">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
              </div>
              <div className="row-main"><div className="row-title">Always-on clock</div><div className="row-sub">Show time in the corner of the HUD</div></div>
              <div className={`switch ${alwaysClock ? 'on' : 'off'}`} onClick={() => setAlwaysClock(v => !v)}>
                <div className="switch-knob" />
              </div>
            </div>

            <div className="row">
              <div className="row-icon sage">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div className="row-main"><div className="row-title">Auto-wake on face detection</div><div className="row-sub">HUD turns on when you look up</div></div>
              <div className={`switch ${autoWake ? 'on' : 'off'}`} onClick={() => setAutoWake(v => !v)}>
                <div className="switch-knob" />
              </div>
            </div>

            <div className="slider-row">
              <div className="slider-head"><span className="slider-label">HUD brightness</span><span className="slider-val">{brightness}%</span></div>
              <input type="range" min="0" max="100" value={brightness} onChange={e => setBrightness(e.target.value)} />
            </div>


          </div>
        </div>

        {/* ── Privacy & safety ─────────────────────────── */}
        <div className="section">
          <div className="section-label">PRIVACY &amp; SAFETY</div>
          <div className="group">
            <div className="row">
              <div className="row-icon sage"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
              <div className="row-main"><div className="row-title">Confirm before posting</div><div className="row-sub">Every social post needs your confirmation</div></div>
              <div className="lock-badge"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>always on</div>
              <div className="switch locked"><div className="switch-knob" /></div>
            </div>
            <div className="locked-note">
              <div className="locked-note-box">Nothing posts publicly from your glass without you confirming it on your phone first.</div>
            </div>
            <div className="storage-bar-wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <div className="storage-bar-head"><span className="label">Saved, not posted</span><span className="value">340 MB</span></div>
              <div className="storage-bar"><div className="seg-saved" style={{ width: '14%' }} /><div className="seg-other" style={{ width: '86%' }} /></div>
              <div className="storage-legend">
                <div className="legend-item"><span className="legend-dot brass" />Saved captures</div>
                <div className="legend-item"><span className="legend-dot sage" />Other app data</div>
              </div>
              <div className="manage-link">Manage saved captures →</div>
            </div>
          </div>
        </div>

        {/* ── About ────────────────────────────────────── */}
        <div className="section">
          <div className="section-label">ABOUT</div>
          <div className="group">
            <div className="row">
              <div className="row-icon neutral"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg></div>
              <div className="row-main"><div className="row-title">App version</div></div>
              <div className="row-value">0.5.0</div>
            </div>
            <div className="row">
              <div className="row-icon neutral"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
              <div className="row-main"><div className="row-title">Glasses firmware</div></div>
              <div className="row-value">0.1.0-dev</div>
            </div>
          </div>
        </div>

        {/* ── Demo tools ───────────────────────────────── */}
        <div className="section">
          <div className="section-label" style={{ cursor:'pointer', userSelect:'none' }} onClick={() => setDemoOpen(v => !v)}>
            DEMO TOOLS {demoOpen ? '▲' : '▼'}
          </div>
          {demoOpen && (
            <div className="group">
              {callStatus && (
                <div style={{ padding:'10px 14px', borderRadius:8, background: callStatus.color + '1a', border:`1px solid ${callStatus.color}33`, fontSize:13, fontWeight:600, color: callStatus.color, marginBottom:4 }}>
                  {callStatus.text}
                </div>
              )}
              <div className="row" style={{ cursor:'pointer' }} onClick={() => glassChannel?.postMessage({ type:'call_start', caller:'Priya', app:'WhatsApp' })}>
                <div className="row-icon" style={{ background:'rgba(37,211,102,0.12)', color:'#25D366' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.37 18a19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.93-8.41A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div className="row-main"><div className="row-title">Incoming call · Priya</div><div className="row-sub">WhatsApp · appears on glass</div></div>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:16, color:'var(--paper-faint)' }}><path d="M9 18l6-6-6-6"/></svg>
              </div>
              <div className="row" style={{ cursor:'pointer' }} onClick={() => glassChannel?.postMessage({ type:'notification', app:'WhatsApp', sender:'Priya', preview:'Are you coming tonight? 🎉' })}>
                <div className="row-icon" style={{ background:'rgba(37,211,102,0.12)', color:'#25D366' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div className="row-main"><div className="row-title">WhatsApp notification</div><div className="row-sub">From Priya · "Are you coming tonight? 🎉"</div></div>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:16, color:'var(--paper-faint)' }}><path d="M9 18l6-6-6-6"/></svg>
              </div>
              <div className="row" style={{ cursor:'pointer' }} onClick={() => glassChannel?.postMessage({ type:'notification', app:'Instagram', sender:'Rahul', preview:'Liked your photo.' })}>
                <div className="row-icon" style={{ background:'rgba(225,48,108,0.12)', color:'#E1306C' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </div>
                <div className="row-main"><div className="row-title">Instagram notification</div><div className="row-sub">From Rahul · "Liked your photo."</div></div>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:16, color:'var(--paper-faint)' }}><path d="M9 18l6-6-6-6"/></svg>
              </div>
              <div className="row" style={{ cursor:'pointer' }} onClick={() => glassChannel?.postMessage({ type:'notification', app:'Gmail', sender:'Harsha from Google', preview:'Your weekly activity summary is ready.' })}>
                <div className="row-icon" style={{ background:'rgba(234,67,53,0.12)', color:'#EA4335' }}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.908 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
                </div>
                <div className="row-main"><div className="row-title">Gmail notification</div><div className="row-sub">Weekly activity summary</div></div>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:16, color:'var(--paper-faint)' }}><path d="M9 18l6-6-6-6"/></svg>
              </div>
              <div className="row" style={{ cursor:'pointer' }} onClick={() => glassChannel?.postMessage({ type:'nav_start', instruction:'Head north', street:'MG Road', distance:'1.2 km', dest:'Kempegowda International Airport', eta:'45 min' })}>
                <div className="row-icon sage">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                </div>
                <div className="row-main"><div className="row-title">Navigate to Airport</div><div className="row-sub">45 min · Turn-by-turn on glass</div></div>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:16, color:'var(--paper-faint)' }}><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>
          )}
        </div>

        {/* ── Danger zone ──────────────────────────────── */}
        <div className="section">
          <div className="section-label">DANGER ZONE</div>
          <div className="group danger-group">
            <div className="row danger-row">
              <div className="row-icon neutral"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-8.35"/></svg></div>
              <div className="row-main"><div className="row-title">Factory reset glass</div><div className="row-sub">Wipes all glass settings + calibration</div></div>
            </div>
            <div className="row danger-row">
              <div className="row-icon neutral"><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.4 5.6a9 9 0 1 1-12.7 0M12 2v8"/></svg></div>
              <div className="row-main"><div className="row-title">Unpair glasses</div><div className="row-sub">Remove this device from your account</div></div>
            </div>
          </div>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
