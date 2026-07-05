import { useState, useEffect, useRef, useCallback } from 'react';
import './GlassHUD.css';
import glassChannel from '../lib/glassChannel';
import useBrainSocket from '../lib/useBrainSocket';

// ─── weather helpers ──────────────────────────────────────────────
const WMO = {
  0:'Clear', 1:'Mostly clear', 2:'Partly cloudy', 3:'Overcast',
  45:'Foggy', 51:'Drizzle', 53:'Drizzle', 61:'Rain', 63:'Rain', 65:'Heavy rain',
  80:'Showers', 81:'Showers', 95:'Thunderstorm',
};
const WMO_ICON = {
  0:'☀', 1:'🌤', 2:'⛅', 3:'☁', 45:'🌫', 51:'🌦', 53:'🌧', 61:'🌧',
  63:'🌧', 65:'⛈', 71:'🌨', 73:'❄', 80:'🌦', 81:'🌦', 95:'⛈',
};


function useLiveClock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    setT(fmt());
    const id = setInterval(() => setT(fmt()), 10000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function useHeartRate() {
  const [bpm, setBpm] = useState(72);
  useEffect(() => {
    const id = setInterval(() => setBpm(v => Math.max(62, Math.min(88, v + ((Math.random() * 4 - 2) | 0)))), 8000);
    return () => clearInterval(id);
  }, []);
  return bpm;
}

function captureFrame(videoEl) {
  if (!videoEl || !videoEl.videoWidth) return null;
  const maxW = 768;
  const scale = Math.min(1, maxW / videoEl.videoWidth);
  const c = document.createElement('canvas');
  c.width  = Math.round(videoEl.videoWidth  * scale);
  c.height = Math.round(videoEl.videoHeight * scale);
  c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.65).split(',')[1];
}

async function askClaude(text, imageBase64 = null) {
  const content = imageBase64
    ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
       { type: 'text', text: text || 'What do you see? Describe briefly in 1-2 sentences.' }]
    : text;
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  });
  const d = await res.json();
  return d.content || d.error;
}

// TTS — speaks text through device speakers
function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95; utter.pitch = 1; utter.volume = 1;
  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
      || voices.find(v => v.lang.startsWith('en-IN'))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  };
  if (window.speechSynthesis.getVoices().length > 0) trySpeak();
  else window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
}

// monotonic sequence ID for outgoing InputEvents to the brain
let _globalSeq = 0;
function nextSeq() { return ++_globalSeq; }

// ─── component ────────────────────────────────────────────────────
export default function GlassHUD() {
  const time = useLiveClock();
  const bpm  = useHeartRate();

  // brain WebSocket
  const { send: sendToBrain, connState: brainConn, lastCard } = useBrainSocket();
  const videoRef = useRef(null);
  const [camReady, setCamReady] = useState(false);

  // weather
  const [weather, setWeather] = useState(null);
  const [city,    setCity]    = useState('');

  // HUD mode: 'idle' | 'wake' | 'listening' | 'processing' | 'answer'
  const [hudMode,        setHudMode]        = useState('idle');
  const [query,          setQuery]          = useState('');
  const [answer,         setAnswer]         = useState('');
  const [showScan,       setShowScan]       = useState(false);
  const [answerExiting,  setAnswerExiting]  = useState(false);
  const [isSpeaking,     setIsSpeaking]     = useState(false);

  // overlay cards (independent of hudMode)
  const [navData,      setNavData]      = useState(null);  const [showNav,     setShowNav]     = useState(false);
  const [musicData,    setMusicData]    = useState(null);  const [showMusic,   setShowMusic]   = useState(false);
  const [notifData,    setNotifData]    = useState(null);  const [showNotif,   setShowNotif]   = useState(false);
  const [callData,     setCallData]     = useState(null);  const [showCall,    setShowCall]    = useState(false);
  const [showWeather,  setShowWeather]  = useState(false);

  // controls chrome
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen,    setIsFullscreen]    = useState(false);
  const [camFlash,        setCamFlash]        = useState(false);
  const controlsTimer = useRef(null);

  // voice query
  const [voiceActive,     setVoiceActive]     = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const transcriptRef    = useRef('');
  const queryRecogRef    = useRef(null);
  const voiceActiveRef   = useRef(false);

  // wake word
  const [wakeListening,  setWakeListening]  = useState(false);
  const [wakeFlash,      setWakeFlash]      = useState(false);
  const wakeRecogRef     = useRef(null);
  const wakeActiveRef    = useRef(false);

  // phone connection + state machine
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [connState, setConnState]   = useState('waiting'); // 'waiting'|'connected'|'reconnecting'
  const phonePingTimer = useRef(null);
  const wasConnectedRef = useRef(false);

  // sequence IDs — monotonic counter for outgoing, highest seen for incoming
  const outSeqRef = useRef(0);
  const inSeqRef  = useRef(0);

  // ── camera ──
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } })
      .then(stream => { if (videoRef.current) { videoRef.current.srcObject = stream; setCamReady(true); } })
      .catch(() => {
        // fallback to any camera
        navigator.mediaDevices?.getUserMedia({ video: true })
          .then(stream => { if (videoRef.current) { videoRef.current.srcObject = stream; setCamReady(true); } })
          .catch(() => {});
      });
    return () => videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
  }, []);

  // ── weather ──
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        const [wr, nr] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`),
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { 'Accept-Language': 'en' } }),
        ]);
        setWeather((await wr.json()).current_weather);
        const nd = await nr.json();
        setCity(nd.address?.city || nd.address?.town || nd.address?.village || '');
      } catch {}
    });
  }, []);

  // ── BroadcastChannel ──
  useEffect(() => {
    if (!glassChannel) return;
    const beatId = setInterval(() => {
      outSeqRef.current += 1;
      glassChannel.postMessage({ type: 'heartbeat_glass', seq_id: outSeqRef.current });
    }, 5000);
    outSeqRef.current += 1;
    glassChannel.postMessage({ type: 'heartbeat_glass', seq_id: outSeqRef.current });

    function handle(e) {
      const msg = e.data;

      // drop stale cards (seq_id present but already superseded)
      if (msg.seq_id !== undefined && msg.seq_id <= inSeqRef.current) return;
      if (msg.seq_id !== undefined) inSeqRef.current = msg.seq_id;

      switch (msg.type) {
        case 'heartbeat_phone':
          setPhoneConnected(true);
          setConnState('connected');
          wasConnectedRef.current = true;
          clearTimeout(phonePingTimer.current);
          phonePingTimer.current = setTimeout(() => {
            setPhoneConnected(false);
            setConnState('reconnecting');
          }, 8000);
          break;
        case 'nav_start':
          setNavData({ instruction: msg.instruction, street: msg.street, distance: msg.distance, dest: msg.dest, eta: msg.eta });
          setShowNav(true);
          speakText(`Navigation started. ${msg.instruction} onto ${msg.street} in ${msg.distance}.`);
          break;
        case 'nav_end':
          setShowNav(false);
          speakText('Navigation ended.');
          break;
        case 'nav_turn':
          setNavData(d => ({ ...d, instruction: msg.instruction, street: msg.street, distance: msg.distance }));
          speakText(`In ${msg.distance}, ${msg.instruction} onto ${msg.street}.`);
          break;
        case 'music_update':
          if (msg.playing) { setMusicData({ track: msg.track, artist: msg.artist }); setShowMusic(true); }
          else setShowMusic(false);
          break;
        case 'notification':
          setNotifData({ app: msg.app, sender: msg.sender, preview: msg.preview });
          setShowNotif(true);
          speakText(`${msg.app} from ${msg.sender}. ${msg.preview}`);
          setTimeout(() => setShowNotif(false), 5000);
          break;
        default: break;
      }
    }
    glassChannel.addEventListener('message', handle);
    return () => { clearInterval(beatId); clearTimeout(phonePingTimer.current); glassChannel.removeEventListener('message', handle); };
  }, []);

  // ── incoming RenderCards from brain ──
  useEffect(() => {
    if (!lastCard) return;
    const card = lastCard;

    if (card.card_type === 'ai_response' || card.card_type === 'action_result' ||
        card.card_type === 'text' || card.card_type === 'status' || card.card_type === 'error') {
      const body = card.body || '';
      setAnswer(body);
      setQuery(card.title ? `"${card.title}"` : query);
      setHudMode('answer');
      setAnswerExiting(false);
      setShowScan(false);

      if (card.audio) {
        setIsSpeaking(true);
        const utter = new SpeechSynthesisUtterance(card.audio);
        utter.rate = 0.95; utter.pitch = 1; utter.volume = 1;
        const trySpeak = () => {
          const voices = window.speechSynthesis.getVoices();
          const voice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
            || voices.find(v => v.lang.startsWith('en')) || voices[0];
          if (voice) utter.voice = voice;
          utter.onend = () => {
            setIsSpeaking(false);
            setTimeout(dismissAnswer, 1500);
          };
          window.speechSynthesis.speak(utter);
        };
        if (window.speechSynthesis.getVoices().length > 0) trySpeak();
        else window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
      }
    }
  }, [lastCard]); // eslint-disable-line

  // ── wake word listener ──
  const startWakeListener = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || wakeActiveRef.current || voiceActiveRef.current) return;

    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = 'en-IN';

    r.onstart = () => { wakeActiveRef.current = true; setWakeListening(true); };

    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.toLowerCase();
        if (t.includes('hey arvo') || t.includes('a arvo') || t.includes('i arvo') || t.includes('hey avo')) {
          r.abort();
          if (!voiceActiveRef.current) {
            setWakeFlash(true);
            setTimeout(() => { setWakeFlash(false); startVoiceQuery(); }, 600);
          }
          return;
        }
      }
    };

    r.onend = () => {
      wakeActiveRef.current = false; setWakeListening(false);
      if (!voiceActiveRef.current) setTimeout(startWakeListener, 600);
    };
    r.onerror = (ev) => {
      wakeActiveRef.current = false; setWakeListening(false);
      if (ev.error !== 'not-allowed' && !voiceActiveRef.current) setTimeout(startWakeListener, 1500);
    };

    wakeRecogRef.current = r;
    try { r.start(); } catch {}
  }, []); // eslint-disable-line

  useEffect(() => {
    // small delay so browser settles before we start
    const t = setTimeout(startWakeListener, 1200);
    return () => clearTimeout(t);
  }, [startWakeListener]);

  // ── manual triggers ──
  function triggerNav()     { setNavData({ instruction: 'Turn right', street: 'MG Road', distance: '200 m' }); setShowNav(v => !v); }
  function triggerMusic()   { setMusicData({ track: 'Midnight Rain', artist: 'Taylor Swift' }); setShowMusic(v => !v); }
  function triggerNotif()   { setNotifData({ app: 'WhatsApp', sender: 'Priya', preview: 'Are you coming tonight?' }); setShowNotif(true); setTimeout(() => setShowNotif(false), 4500); }
  function triggerWeather() { setShowWeather(v => !v); }
  function triggerCall()    { setCallData({ caller: 'Priya', app: 'WhatsApp' }); setShowCall(true); }

  function dismissAnswer() {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setAnswerExiting(true);
    setTimeout(() => { setHudMode('idle'); setAnswerExiting(false); setAnswer(''); setQuery(''); setShowScan(false); }, 400);
  }

  function acceptCall() {
    setShowCall(false);
    speakText('Call accepted');
  }
  function declineCall() {
    setShowCall(false);
    speakText('Call declined');
  }

  // ── voice query (after wake word or button tap) ──
  function startVoiceQuery() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Use Chrome — Web Speech API required.'); return; }
    wakeRecogRef.current?.abort();
    wakeActiveRef.current = false;
    voiceActiveRef.current = true;
    transcriptRef.current = '';

    const recog = new SR();
    recog.lang = 'en-IN'; recog.interimResults = true; recog.continuous = false;

    recog.onstart = () => { setVoiceActive(true); setHudMode('listening'); setVoiceTranscript(''); };

    recog.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('');
      setVoiceTranscript(t);
      transcriptRef.current = t;
    };

    recog.onend = async () => {
      setVoiceActive(false);
      const text = transcriptRef.current.trim();
      if (!text) { setHudMode('idle'); setVoiceTranscript(''); voiceActiveRef.current = false; startWakeListener(); return; }

      const frame = captureFrame(videoRef.current);
      setHudMode('processing');
      setQuery(`"${text}"`);
      setShowScan(!!frame);
      setVoiceTranscript('');

      const seq = nextSeq();
      const sent = sendToBrain({
        type: 'discrete',
        source: 'voice',
        text,
        sequence_id: seq,
        timestamp: new Date().toISOString(),
        is_final: true,
      });

      if (!sent) {
        // brain not connected — fall back to direct Claude call
        try {
          const ans = await askClaude(text, frame);
          setShowScan(false);
          setAnswer(ans);
          setHudMode('answer');
          setAnswerExiting(false);
          setIsSpeaking(true);
          const utter = new SpeechSynthesisUtterance(ans);
          utter.rate = 0.95; utter.pitch = 1; utter.volume = 1;
          const trySpeak = () => {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
              || voices.find(v => v.lang.startsWith('en')) || voices[0];
            if (voice) utter.voice = voice;
            utter.onend = () => { setIsSpeaking(false); setTimeout(dismissAnswer, 1500); };
            window.speechSynthesis.speak(utter);
          };
          if (window.speechSynthesis.getVoices().length > 0) trySpeak();
          else window.speechSynthesis.addEventListener('voiceschanged', trySpeak, { once: true });
          outSeqRef.current += 1;
          glassChannel?.postMessage({ type: 'glass_query', seq_id: outSeqRef.current, id: `g${Date.now()}`, text, answer: ans, hasImage: !!frame });
        } catch {
          setShowScan(false);
          setAnswer('Could not reach AI. Check your connection.');
          setHudMode('answer');
        }
      }
      // if sent=true, response arrives via lastCard useEffect above

      voiceActiveRef.current = false;
      setTimeout(startWakeListener, 2000);
    };

    recog.onerror = () => {
      setVoiceActive(false); setHudMode('idle'); setVoiceTranscript('');
      voiceActiveRef.current = false; startWakeListener();
    };
    queryRecogRef.current = recog;
    recog.start();
  }

  function stopVoice() {
    queryRecogRef.current?.stop();
    setVoiceActive(false);
    voiceActiveRef.current = false;
  }

  // ── controls chrome ──
  function bumpControls() {
    setControlsVisible(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setControlsVisible(false), 3500);
  }
  useEffect(() => {
    window.addEventListener('mousemove', bumpControls);
    window.addEventListener('touchstart', bumpControls);
    bumpControls();
    return () => { window.removeEventListener('mousemove', bumpControls); window.removeEventListener('touchstart', bumpControls); };
  }, []);

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return;
      bumpControls();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'n') triggerNav();
      if (e.key === 'm') triggerMusic();
      if (e.key === 'w') triggerWeather();
      if (e.key === 'c') triggerCall();
      if (e.key === 'Escape') { if (document.fullscreenElement) document.exitFullscreen(); else dismissAnswer(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── render ──
  const wIcon = weather ? (WMO_ICON[weather.weathercode] ?? '🌡') : null;
  const wLabel = weather ? (WMO[weather.weathercode] ?? '') : null;
  const isAnswer = hudMode === 'answer' && answer;

  return (
    <div className="glass-shell">
      <video ref={videoRef} autoPlay playsInline muted className={`glass-camera${camReady ? ' ready' : ''}`} />
      {!camReady && <div className="glass-no-camera" />}
      <div className="glass-vignette" />
      <div className="glass-scanlines" />
      <div className={`cam-flash${camFlash ? ' active' : ''}`} />

      {/* AR scan overlay */}
      <div className={`ar-scan${showScan ? ' visible' : ''}`}>
        <div className="ar-corner tl" /><div className="ar-corner tr" />
        <div className="ar-corner bl" /><div className="ar-corner br" />
        <div className="ar-sweep" />
      </div>

      {/* ── CALL OVERLAY — highest priority, blurs everything ── */}
      {showCall && callData && (
        <div className="call-overlay">
          <div className="call-ring">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.37 18a19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.93-8.41A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <div className="call-app">{callData.app}</div>
          <div className="call-caller">{callData.caller}</div>
          <div className="call-label">Incoming call</div>
          <div className="call-actions">
            <button className="call-btn decline" onClick={declineCall}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              Decline
            </button>
            <button className="call-btn accept" onClick={acceptCall}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.37 18a19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.93-8.41A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Accept
            </button>
          </div>
          <div className="call-hint">say "accept" or "decline"</div>
        </div>
      )}

      {/* ── RECONNECTING BANNERS ── */}
      {connState === 'reconnecting' && (
        <div className="reconnecting-banner" style={{ top: '55%' }}>
          <span className="reconnecting-spinner" />
          Reconnecting to phone…
        </div>
      )}
      {brainConn === 'reconnecting' && (
        <div className="reconnecting-banner">
          <span className="reconnecting-spinner" />
          Reconnecting to brain…
        </div>
      )}

      {/* ── HUD LAYER ── */}
      <div className="hud">

        {/* Notification toast — slides from top, takes priority */}
        <div className={`hud-notification${showNotif && notifData ? ' visible' : ''}${!showNotif && notifData ? ' exiting' : ''}`}>
          <div className="notif-app-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.5 8.5 0 1 1-3.8-7.1M21 11.5L17 10l1.2-3.6"/>
            </svg>
          </div>
          <div className="notif-body">
            <div className="notif-app">{notifData?.app}</div>
            <div className="notif-sender">{notifData?.sender}</div>
            <div className="notif-preview">{notifData?.preview}</div>
          </div>
          <div className="notif-hint">say "reply" to respond</div>
        </div>

        {/* Status bar — always visible, minimal */}
        <div className="hud-top">
          <div className="hud-brand">
            ARVO
            <span className="dot-live" />
          </div>

          <div className="hud-time">{time}</div>

          <div className="hud-vitals">
            {bpm > 0 && (
              <div className="hud-stat heart">
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width:10, height:10 }}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                {bpm}
              </div>
            )}
            {weather && (
              <div className="hud-stat weather-pill">
                {wIcon} {Math.round(weather.temperature)}°
              </div>
            )}
            <div className={`hud-stat${phoneConnected ? ' ok' : ' dim'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:11, height:11 }}>
                <rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="17" r="1" fill="currentColor"/>
              </svg>
              {phoneConnected ? 'live' : 'off'}
            </div>
            <div className={`hud-stat${brainConn === 'connected' ? ' ok' : ' dim'}`} title="Brain connection">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:11, height:11 }}>
                <path d="M1.42 9a16 16 0 0 1 21.16 0M5 12.55a11 11 0 0 1 14.08 0M10.71 17.4l1.29 1.6 1.29-1.6a4 4 0 0 0-2.58 0z"/>
              </svg>
              {brainConn === 'connected' ? 'brain' : brainConn === 'reconnecting' ? '…' : 'off'}
            </div>
            <button className="hud-fs-btn" onClick={toggleFullscreen}>
              {isFullscreen
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              }
            </button>
          </div>
        </div>

        {/* ── CENTER ZONE — one thing at a time ── */}
        <div className="hud-center">

          {/* Wake word detected flash */}
          <div className={`wake-flash${wakeFlash ? ' visible' : ''}`}>
            <span className="wake-dot" />
            Hey ARVO
          </div>

          {/* Voice listening ring */}
          <div className={`subvocal-indicator${hudMode === 'listening' ? ' visible' : ''}`}>
            <div className="sv-ring">
              <div className="sv-wave">
                {[...Array(5)].map((_, i) => <div key={i} className="sv-bar" />)}
              </div>
            </div>
            <div className="sv-label">{voiceActive ? 'listening…' : 'listening…'}</div>
          </div>

          {/* Query text */}
          <div className={`hud-query-text${(hudMode === 'processing' || hudMode === 'answer') && query ? ' visible' : ''}`}>
            {query}
          </div>

          {/* Processing dots */}
          <div className={`hud-processing${hudMode === 'processing' ? ' visible' : ''}`}>
            <div className="proc-dot" /><div className="proc-dot" /><div className="proc-dot" />
            <span className="proc-label">{showScan ? 'scanning scene' : 'processing'}</span>
          </div>

          {/* AI answer card */}
          {(isAnswer || answerExiting) && (
            <div
              className={`hud-answer-card${isAnswer && !answerExiting ? ' visible' : ''}${answerExiting ? ' exiting' : ''}`}
              onClick={dismissAnswer}
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
            >
              <div className="answer-card-eyebrow">
                ARVO AI
                {isSpeaking && (
                  <span className="speaking-badge">
                    <span className="speak-dot" /><span className="speak-dot" /><span className="speak-dot" />
                    speaking
                  </span>
                )}
              </div>
              <div className="answer-card-query">{query}</div>
              <div className="answer-card-text">{answer}</div>
              <div className="answer-card-footer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:11,height:11}}><path d="M20 6L9 17l-5-5"/></svg>
                tap to dismiss
              </div>
            </div>
          )}

          {/* Weather card (center popup) */}
          {weather && (
            <div className={`weather-card${showWeather ? ' visible' : ''}`} onClick={() => setShowWeather(false)} style={{ pointerEvents: showWeather ? 'auto' : 'none' }}>
              <div className="weather-icon">{wIcon}</div>
              <div className="weather-body">
                <div className="weather-temp">{Math.round(weather.temperature)}°C</div>
                <div className="weather-cond">{wLabel}{city ? ` · ${city}` : ''}</div>
                <div className="weather-wind">Wind {weather.windspeed} km/h</div>
              </div>
            </div>
          )}
        </div>

        {/* ── BOTTOM STRIP ── */}
        <div className="hud-bottom">

          {/* Nav card — bottom left */}
          <div className={`nav-card${showNav && navData ? ' visible' : ''}${!showNav && navData ? ' exiting' : ''}`}>
            <div className="nav-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17l10-10M7 7h10v10"/>
              </svg>
            </div>
            <div className="nav-text">
              <div className="nav-dist">{navData?.distance}</div>
              <div className="nav-instruction">{navData?.instruction}</div>
              <div className="nav-street">{navData?.street}</div>
              {navData?.dest && <div className="nav-dest">→ {navData.dest}{navData.eta ? ` · ${navData.eta}` : ''}</div>}
            </div>
          </div>

          {/* Music pill — bottom right */}
          <div className={`music-card${showMusic && musicData ? ' visible' : ''}${!showMusic && musicData ? ' exiting' : ''}`}>
            <div className="music-eq">
              {[...Array(4)].map((_, i) => <div key={i} className="music-eq-bar" />)}
            </div>
            <div className="music-info">
              <div className="music-track">{musicData?.track}</div>
              <div className="music-artist">{musicData?.artist}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live voice transcript bubble */}
      <div className={`voice-transcript${voiceTranscript ? ' visible' : ''}`}>
        {voiceTranscript}
      </div>

      {/* Wake word always-on indicator */}
      <div className={`wake-indicator${wakeListening && !voiceActive && hudMode === 'idle' ? ' visible' : ''}`}>
        <span className="wake-ring" />
        hey arvo
      </div>

      {/* Control bar */}
      <div className={`hud-controls${controlsVisible ? '' : ' hidden'}`}>
        <button className={`ctrl-btn${voiceActive ? ' active' : ''}`} onClick={voiceActive ? stopVoice : startVoiceQuery}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3"/>
          </svg>
          {voiceActive ? 'Stop' : 'Ask Claude'}
        </button>
        <div className="ctrl-divider" />

        {/* Scan mode buttons — always visible, no popup */}
        <button className="ctrl-btn" onClick={triggerNav} title="N">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5 1.5L5 16 16 5l3 3L8 19"/></svg>
          {showNav ? 'Nav off' : 'Nav'}
        </button>
        <button className="ctrl-btn" onClick={triggerMusic} title="M">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>
          {showMusic ? 'Music off' : 'Music'}
        </button>
        <button className="ctrl-btn" onClick={triggerWeather} title="W">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
          Weather
        </button>
        <button className="ctrl-btn" onClick={triggerNotif}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Notify
        </button>
        <button className="ctrl-btn" onClick={triggerCall} title="C">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 15.77 15.77 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Call
        </button>
      </div>

      <div className={`key-hints${controlsVisible ? '' : ' hidden'}`}>
        <span>N nav</span><span>M music</span><span>W weather</span><span>C call</span><span>Esc dismiss</span>
      </div>
    </div>
  );
}
