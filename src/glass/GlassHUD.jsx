import { useState, useEffect, useRef, useCallback } from 'react';
import './GlassHUD.css';
import glassChannel from '../lib/glassChannel';
import useBrainSocket from '../lib/useBrainSocket';
import { play as spotifyPlay, pause as spotifyPause, next as spotifyNext, previous as spotifyPrev, searchAndPlay, getCurrentlyPlaying, isConnected as spotifyIsConnected, initiateLogin as spotifyLogin, disconnect as spotifyDisconnect } from '../lib/spotify';

// ─── app branding ─────────────────────────────────────────────────
function getAppBrand(app = '') {
  const n = app.toLowerCase();
  if (n.includes('whatsapp'))                      return { color: '#25D366', bg: 'rgba(37,211,102,0.15)', border: 'rgba(37,211,102,0.3)' };
  if (n.includes('instagram'))                     return { color: '#E1306C', bg: 'rgba(225,48,108,0.15)', border: 'rgba(225,48,108,0.3)' };
  if (n.includes('messenger') || n.includes('facebook')) return { color: '#0099FF', bg: 'rgba(0,153,255,0.15)', border: 'rgba(0,153,255,0.3)' };
  if (n.includes('gmail') || n.includes('email') || n.includes('mail')) return { color: '#EA4335', bg: 'rgba(234,67,53,0.15)', border: 'rgba(234,67,53,0.3)' };
  if (n.includes('youtube'))                       return { color: '#FF0000', bg: 'rgba(255,0,0,0.15)',    border: 'rgba(255,0,0,0.3)' };
  if (n.includes('spotify'))                       return { color: '#1DB954', bg: 'rgba(29,185,84,0.15)', border: 'rgba(29,185,84,0.3)' };
  if (n.includes('maps') || n.includes('waze'))   return { color: '#4285F4', bg: 'rgba(66,133,244,0.15)', border: 'rgba(66,133,244,0.3)' };
  if (n.includes('snapchat'))                      return { color: '#FFFC00', bg: 'rgba(255,252,0,0.12)',  border: 'rgba(255,252,0,0.25)' };
  if (n.includes('twitter') || n.includes('x'))   return { color: '#ffffff', bg: 'rgba(255,255,255,0.1)', border: 'rgba(255,255,255,0.2)' };
  if (n.includes('telegram'))                      return { color: '#2AABEE', bg: 'rgba(42,171,238,0.15)', border: 'rgba(42,171,238,0.3)' };
  if (n.includes('phone') || n.includes('call'))  return { color: '#34D399', bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.3)' };
  return { color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.1)' };
}

function AppIcon({ app = '', size = 16 }) {
  const n = app.toLowerCase();
  const s = { width: size, height: size, flexShrink: 0 };

  if (n.includes('whatsapp')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#25D366'}}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
  if (n.includes('instagram')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#E1306C'}}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
  if (n.includes('messenger') || n.includes('facebook')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#0099FF'}}>
      <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.301 2.246.465 3.443.465 6.627 0 12-4.975 12-11.112C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.259L19.752 8l-6.561 6.963z"/>
    </svg>
  );
  if (n.includes('gmail') || n.includes('email') || n.includes('mail')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#EA4335'}}>
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.908 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
    </svg>
  );
  if (n.includes('youtube')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#FF0000'}}>
      <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
    </svg>
  );
  if (n.includes('spotify')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#1DB954'}}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
  if (n.includes('maps') || n.includes('waze') || n.includes('navigation')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#4285F4'}}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  );
  if (n.includes('snapchat')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#FFFC00'}}>
      <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.304 4.93l-.01.16c-.012.19.048.39.181.532.162.174.42.252.68.207.062-.01.12-.016.175-.016.663 0 1.096.418 1.098 1.066.002.54-.344.97-.81 1.09-.06.014-.12.022-.177.022-.37 0-.726-.167-.96-.45-.026-.032-.051-.064-.073-.098-.113-.162-.263-.27-.456-.267-.234.003-.44.152-.523.38-.08.224-.046.47.097.652.384.49.626 1.09.626 1.75 0 .87-.4 1.66-1.06 2.22a3.97 3.97 0 01-2.4.75c-.207 0-.412-.018-.61-.05-.08-.012-.16-.018-.238-.018-.222 0-.43.058-.6.167-.175.11-.32.27-.406.47-.087.2-.1.42-.037.63.063.213.187.395.357.53.17.134.368.2.574.2.15 0 .295-.036.43-.11a.77.77 0 01.353-.093c.268 0 .506.146.627.38.087.171.1.37.037.55-.062.18-.188.33-.35.42a3.08 3.08 0 01-1.457.338c-.53 0-1.05-.118-1.517-.345-.47-.228-.87-.55-1.176-.944a.8.8 0 00-.637-.313.8.8 0 00-.637.313 3.43 3.43 0 01-1.176.944 3.43 3.43 0 01-1.517.345 3.08 3.08 0 01-1.457-.338.77.77 0 01-.35-.42.62.62 0 01.037-.55.7.7 0 01.627-.38.77.77 0 01.353.093c.135.074.28.11.43.11.206 0 .404-.066.574-.2.17-.135.294-.317.357-.53.063-.21.05-.43-.037-.63a1.07 1.07 0 00-.406-.47 1.07 1.07 0 00-.6-.167c-.078 0-.158.006-.238.018-.198.032-.403.05-.61.05a3.97 3.97 0 01-2.4-.75c-.66-.56-1.06-1.35-1.06-2.22 0-.66.242-1.26.626-1.75.143-.182.177-.428.097-.652-.083-.228-.29-.377-.523-.38-.193-.003-.343.105-.456.267a1.2 1.2 0 01-.073.098c-.234.283-.59.45-.96.45-.057 0-.117-.008-.177-.022-.466-.12-.812-.55-.81-1.09.002-.648.435-1.066 1.098-1.066.055 0 .113.006.175.016.26.045.518-.033.68-.207.133-.142.193-.342.181-.532l-.01-.16c-.099-1.711-.225-3.737.304-4.93C7.86 1.069 11.217.793 12.206.793z"/>
    </svg>
  );
  if (n.includes('telegram')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#2AABEE'}}>
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
  if (n.includes('call') || n.includes('phone')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#22C55E'}}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
  if (n.includes('camera') || n.includes('photo')) return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{...s, color:'#F97316'}}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4" fill="rgba(0,0,0,0.4)"/>
    </svg>
  );
  // default
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{...s, color:'rgba(255,255,255,0.55)'}}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  );
}

// ─── app home grid tiles ──────────────────────────────────────────
const PAGE_TILES = [
  [
    { name: 'WhatsApp',  bg: '#0d2218' },
    { name: 'Instagram', bg: 'linear-gradient(135deg,#2d0e3f 0%,#3f1020 100%)' },
    { name: 'Messenger', bg: '#091a30' },
    { name: 'Calls',     bg: '#0a2410' },
    { name: 'Spotify',   bg: '#091a09' },
    { name: 'Maps',      bg: '#0a1220' },
  ],
  [
    { name: 'Camera',    bg: 'linear-gradient(135deg,#1e0c02 0%,#2d1505 100%)' },
    { name: 'YouTube',   bg: '#1a0202' },
    { name: 'Telegram',  bg: '#031828' },
    { name: 'Snapchat',  bg: '#181800' },
    { name: 'Gmail',     bg: 'linear-gradient(135deg,#1e0603 0%,#2a0804 100%)' },
    { name: 'Twitter',   bg: '#05080f' },
  ],
];

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

// iOS detection — all iOS browsers use WebKit which blocks background mic access
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && 'ontouchend' in window;

// volume is set per-utterance; module var keeps it in sync across all calls
let _vol = 1;

function speakText(text, onDone) {
  if (!window.speechSynthesis) { onDone?.(); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95; utter.pitch = 1; utter.volume = _vol;
  utter.onend = () => onDone?.();
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

let _globalSeq = 0;
function nextSeq() { return ++_globalSeq; }

// ─── component ────────────────────────────────────────────────────
export default function GlassHUD() {
  const time = useLiveClock();
  const bpm  = useHeartRate();

  const { send: sendToBrain, connState: brainConn, lastCard } = useBrainSocket();
  const videoRef = useRef(null);
  const [camReady, setCamReady] = useState(false);

  const [weather, setWeather] = useState(null);
  const [city,    setCity]    = useState('');

  // HUD mode
  const [hudMode,        setHudMode]        = useState('idle');
  const [query,          setQuery]          = useState('');
  const [answer,         setAnswer]         = useState('');
  const [showScan,       setShowScan]       = useState(false);
  const [answerExiting,  setAnswerExiting]  = useState(false);
  const [isSpeaking,     setIsSpeaking]     = useState(false);

  // session mode — stay listening after ARVO answers
  const [inSession,    setInSession]    = useState(false);
  const inSessionRef   = useRef(false);
  const sessionTimerRef = useRef(null);

  // volume
  const [volumeLevel, setVolumeLevel] = useState(1);
  useEffect(() => { _vol = volumeLevel; }, [volumeLevel]);

  // scrollable answer card
  const answerScrollRef = useRef(null);

  // track last card/answer for "repeat" command
  const lastCardRef = useRef(null);
  const answerRef   = useRef('');
  useEffect(() => { answerRef.current = answer; }, [answer]);

  // overlay cards
  const [navData,      setNavData]      = useState(null);  const [showNav,     setShowNav]     = useState(false);
  const [musicData,    setMusicData]    = useState(null);  const [showMusic,   setShowMusic]   = useState(false);
  const [notifData,    setNotifData]    = useState(null);  const [showNotif,   setShowNotif]   = useState(false);
  const [callData,     setCallData]     = useState(null);  const [showCall,    setShowCall]    = useState(false);
  const [showWeather,  setShowWeather]  = useState(false);
  const [gridPage,     setGridPage]     = useState(0);
  const [gridOffset,   setGridOffset]   = useState(0);
  const [showCP,       setShowCP]       = useState(false);
  const [cpView,       setCpView]       = useState('main');
  const [cpMuted,      setCpMuted]      = useState(false);
  const [cpDND,        setCpDND]        = useState(false);
  const [battery,      setBattery]      = useState(null);
  const [brightness,   setBrightness]   = useState(100);
  const [spotifyConn,  setSpotifyConn]  = useState(() => spotifyIsConnected());
  const cpDragY   = useRef(null);
  const cpDNDRef  = useRef(false);
  useEffect(() => { cpDNDRef.current = cpDND; }, [cpDND]);
  // close settings view when CP is closed
  useEffect(() => { if (!showCP) setCpView('main'); }, [showCP]);
  const gridDragX  = useRef(null);
  const gridPageRef = useRef(0);
  const slidesRef   = useRef(null);
  useEffect(() => { gridPageRef.current = gridPage; }, [gridPage]);

  // Non-passive touchmove so we can preventDefault and stop scroll hijack
  useEffect(() => {
    const el = slidesRef.current;
    if (!el) return;
    const handler = e => {
      if (gridDragX.current === null) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - gridDragX.current;
      const page = gridPageRef.current;
      const clamped = page === 0 ? Math.max(dx, -300)
                    : page === PAGE_TILES.length - 1 ? Math.min(dx, 300)
                    : dx;
      setGridOffset(clamped);
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  const showCallRef = useRef(false);
  useEffect(() => { showCallRef.current = showCall; }, [showCall]);

  useEffect(() => {
    if (!('getBattery' in navigator)) return;
    navigator.getBattery().then(b => {
      setBattery(Math.round(b.level * 100));
      b.addEventListener('levelchange', () => setBattery(Math.round(b.level * 100)));
    });
  }, []);

  // controls chrome
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen,    setIsFullscreen]    = useState(false);
  const [camFlash,        setCamFlash]        = useState(false);
  const controlsTimer = useRef(null);

  // voice
  const [voiceActive,     setVoiceActive]     = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const transcriptRef    = useRef('');
  const queryRecogRef    = useRef(null);
  const voiceActiveRef   = useRef(false);

  // wake word
  const [wakeListening,  setWakeListening]  = useState(false);
  const [wakeFlash,      setWakeFlash]      = useState(false);
  const [wakeTranscript, setWakeTranscript] = useState('');
  const wakeRecogRef     = useRef(null);
  const wakeActiveRef    = useRef(false);

  // phone connection
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [connState,      setConnState]      = useState('waiting');
  const phonePingTimer   = useRef(null);

  // sequence IDs
  const outSeqRef = useRef(0);
  const inSeqRef  = useRef(0);

  // ── camera ──
  useEffect(() => {
    let activeStream = null;
    const attach = (stream) => {
      activeStream = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; setCamReady(true); }
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } })
      .then(attach)
      .catch(() => navigator.mediaDevices?.getUserMedia({ video: true }).then(attach).catch(() => {}));
    // capture stream in closure — videoRef.current is null by the time cleanup runs
    return () => activeStream?.getTracks().forEach(t => t.stop());
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
      if (msg.seq_id !== undefined && msg.seq_id <= inSeqRef.current) return;
      if (msg.seq_id !== undefined) inSeqRef.current = msg.seq_id;

      switch (msg.type) {
        case 'heartbeat_phone':
          setPhoneConnected(true);
          setConnState('connected');
          clearTimeout(phonePingTimer.current);
          phonePingTimer.current = setTimeout(() => {
            setPhoneConnected(false);
            setConnState('reconnecting');
          }, 30000);
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
          if (cpDNDRef.current) break;
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

  // ── session mode ──
  // After ARVO answers, stay in listening mode for 5s — no "Hey ARVO" needed for follow-up
  function startSession() {
    inSessionRef.current = true;
    setInSession(true);
    clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = setTimeout(() => {
      inSessionRef.current = false;
      setInSession(false);
      startWakeListener();
    }, 5000);
    // brief pause (let TTS fully end) then auto-listen
    setTimeout(() => {
      if (inSessionRef.current && !voiceActiveRef.current) {
        startVoiceQuery();
      }
    }, 900);
  }

  function endSession() {
    clearTimeout(sessionTimerRef.current);
    inSessionRef.current = false;
    setInSession(false);
  }

  // ── incoming RenderCards from brain ──
  useEffect(() => {
    if (!lastCard) return;
    lastCardRef.current = lastCard;
    const card = lastCard;

    if (card.card_type === 'spotify_command') {
      if (card.body === 'play')                    spotifyPlay();
      else if (card.body === 'pause')              spotifyPause();
      else if (card.body === 'next')               spotifyNext();
      else if (card.body.startsWith('search:'))    searchAndPlay(card.body.slice(7));
      setAnswer(card.title || 'Done');
      setHudMode('answer');
      setAnswerExiting(false);
      setShowScan(false);
      if (card.audio) speakText(card.audio, startSession);
      else startSession();
      return;
    }

    if (card.card_type === 'ai_response' || card.card_type === 'action_result' ||
        card.card_type === 'text' || card.card_type === 'status' || card.card_type === 'error') {
      setAnswer(card.body || '');
      setQuery(prev => card.title ? `"${card.title}"` : prev);
      setHudMode('answer');
      setAnswerExiting(false);
      setShowScan(false);

      if (card.audio) {
        setIsSpeaking(true);
        speakText(card.audio, () => {
          setIsSpeaking(false);
          startSession();
        });
      } else {
        startSession();
      }
    }
  }, [lastCard]); // eslint-disable-line

  // ── wake word listener ──
  // Uses short non-continuous sessions looped rapidly — more reliable than
  // continuous:true which often silently drops audio on desktop Chrome.
  const startWakeListener = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || wakeActiveRef.current || voiceActiveRef.current) return;

    let handedOff = false;

    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 3;

    r.onstart = () => { wakeActiveRef.current = true; setWakeListening(true); };

    r.onresult = (e) => {
      const texts = [];
      for (let i = 0; i < e.results.length; i++) {
        for (let j = 0; j < e.results[i].length; j++) {
          texts.push(e.results[i][j].transcript.toLowerCase());
        }
      }
      const t = texts.join(' ');
      setWakeTranscript(t);

      // Trigger on "hey" as a word OR any ARVO variant.
      // Chrome sometimes ends the session after just "hey" before the user says "ARVO".
      const triggered = /\bhey\b/.test(t) || /ar[vwou]/.test(t) || /har[vw]/.test(t);

      if (triggered && !voiceActiveRef.current && !handedOff) {
        handedOff = true;
        r.abort(); // release mic before voice query grabs it
        setWakeTranscript('');
        setWakeFlash(true);
        setWakeListening(false);
        // 400ms lets the mic fully release before voice query starts
        setTimeout(() => startVoiceQuery(), 400);
      }
    };

    r.onend = () => {
      wakeActiveRef.current = false;
      setWakeTranscript('');
      if (!handedOff && !voiceActiveRef.current) setTimeout(startWakeListener, 250);
      else if (!handedOff) setWakeListening(false);
    };
    r.onerror = (ev) => {
      wakeActiveRef.current = false; setWakeListening(false); setWakeTranscript('');
      if (ev.error !== 'not-allowed' && ev.error !== 'aborted' && !voiceActiveRef.current) {
        setTimeout(startWakeListener, 1000);
      }
    };

    wakeRecogRef.current = r;
    try { r.start(); } catch {}
  }, []); // eslint-disable-line

  useEffect(() => {
    if (isIOS) {
      document.body.classList.add('ios-glass');
      return; // iOS WebKit blocks background mic — wake word not supported
    }
    const t = setTimeout(startWakeListener, 1200);
    return () => clearTimeout(t);
  }, [startWakeListener]);

  // ── grid drag (mouse + touch) ──
  function onGridDragStart(clientX) { gridDragX.current = clientX; }
  function onGridDragMove(clientX) {
    if (gridDragX.current === null) return;
    const dx = clientX - gridDragX.current;
    const page = gridPageRef.current;
    const clamped = page === 0 ? Math.max(dx, -300)
                  : page === PAGE_TILES.length - 1 ? Math.min(dx, 300)
                  : dx;
    setGridOffset(clamped);
  }
  function onGridDragEnd(clientX) {
    if (gridDragX.current === null) return;
    const dx = clientX - gridDragX.current;
    if (dx < -50) setGridPage(p => Math.min(p + 1, PAGE_TILES.length - 1));
    else if (dx > 50) setGridPage(p => Math.max(p - 1, 0));
    gridDragX.current = null;
    setGridOffset(0);
  }

  // ── manual triggers ──
  function triggerNav()     { setNavData({ instruction: 'Turn right', street: 'MG Road', distance: '200 m' }); setShowNav(v => !v); }
  async function triggerMusic() {
    if (showMusic) { setShowMusic(false); return; }
    try {
      const data = await getCurrentlyPlaying();
      if (data?.item) {
        setMusicData({ track: data.item.name, artist: data.item.artists.map(a => a.name).join(', '), albumArt: data.item.album.images[0]?.url, source: 'spotify' });
      } else {
        setMusicData({ track: 'Nothing playing', artist: 'Open Spotify to start', source: 'spotify' });
      }
    } catch { setMusicData({ track: 'Spotify', artist: 'Not connected', source: 'spotify' }); }
    setShowMusic(true);
  }
  function triggerNotif()   { setNotifData({ app: 'WhatsApp', sender: 'Priya', preview: 'Are you coming tonight?' }); setShowNotif(true); setTimeout(() => setShowNotif(false), 4500); }
  function triggerWeather() { setShowWeather(v => !v); }
  // Poll Spotify every 30s while music is showing
  useEffect(() => {
    if (!showMusic) return;
    const poll = async () => {
      try {
        const data = await getCurrentlyPlaying();
        if (data?.item) {
          setMusicData(prev => {
            if (prev?.track === data.item.name) return prev;
            return { track: data.item.name, artist: data.item.artists.map(a => a.name).join(', '), albumArt: data.item.album.images[0]?.url, source: 'spotify' };
          });
        }
      } catch {}
    };
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [showMusic]);

  function triggerCall()    { setCallData({ caller: 'Priya', app: 'WhatsApp' }); setShowCall(true); }

  function dismissAnswer() {
    endSession(); // cancel auto-relisten timer so voice doesn't restart after dismiss
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setAnswerExiting(true);
    setTimeout(() => {
      setHudMode('idle'); setAnswerExiting(false); setAnswer(''); setQuery(''); setShowScan(false);
      if (!isIOS) startWakeListener();
    }, 400);
  }

  function acceptCall() { setShowCall(false); speakText('Call accepted'); }
  function declineCall() { setShowCall(false); speakText('Call declined'); }

  // ── voice query ──
  function startVoiceQuery(noSpeechRetries = 4) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Use Chrome — Web Speech API required.'); return; }
    const wakeWasActive = wakeActiveRef.current;
    wakeRecogRef.current?.abort();
    wakeActiveRef.current = false;
    voiceActiveRef.current = true;
    transcriptRef.current = '';
    // On mobile the mic needs ~300ms to release from wake listener before a new session
    if (wakeWasActive && noSpeechRetries === 4) {
      setTimeout(() => _launchVoiceRecog(noSpeechRetries), 300);
      return;
    }
    _launchVoiceRecog(noSpeechRetries);
  }

  function _launchVoiceRecog(noSpeechRetries) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    const recog = new SR();
    recog.lang = 'en-IN'; recog.interimResults = true; recog.continuous = false;

    recog.onstart = () => { setVoiceActive(true); setHudMode('listening'); setVoiceTranscript(''); setWakeFlash(false); };

    recog.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('');
      setVoiceTranscript(t);
      transcriptRef.current = t;
    };

    recog.onend = async () => {
      setVoiceActive(false);
      voiceActiveRef.current = false;

      let text = transcriptRef.current.trim();
      setVoiceTranscript('');

      // no speech — if in session try again, else go to wake listener
      if (!text) {
        if (inSessionRef.current) {
          setTimeout(() => {
            if (inSessionRef.current && !voiceActiveRef.current) startVoiceQuery();
          }, 400);
        } else {
          setHudMode('idle');
          startWakeListener();
        }
        return;
      }

      // strip "hey [arvo]" / "arvo" prefix — wake trigger fires on "hey" alone so
      // "hey what's the time" must become "what's the time"
      text = text.replace(/^(?:hey\s+(?:arvo\s*)?|arvo\s+)/i, '').trim() || text;

      setHudMode('processing');
      setQuery(`"${text}"`);

      // ── LOCAL NAVIGATION COMMANDS — instant, no brain call ──
      const cmd = text.toLowerCase().trim();

      // home / dismiss
      if (/^(home|go home|dismiss|close|go back|back|cancel|never mind|nevermind)$/.test(cmd)) {
        endSession();
        dismissAnswer();
        setTimeout(startWakeListener, 500);
        return;
      }

      // repeat last answer
      if (/^(repeat|read again|say again|say that again|what did you say)$/.test(cmd)) {
        const audio = lastCardRef.current?.audio || answerRef.current;
        if (audio) speakText(audio, startSession);
        else startSession();
        setHudMode(answerRef.current ? 'answer' : 'idle');
        return;
      }

      // scroll
      if (/^(scroll down|down|more)$/.test(cmd)) {
        answerScrollRef.current?.scrollBy({ top: 100, behavior: 'smooth' });
        setHudMode('idle');
        startSession();
        return;
      }
      if (/^(scroll up|up)$/.test(cmd)) {
        answerScrollRef.current?.scrollBy({ top: -100, behavior: 'smooth' });
        setHudMode('idle');
        startSession();
        return;
      }

      // volume
      if (/^(volume up|louder|turn up|increase volume)$/.test(cmd)) {
        const v = Math.min(1, volumeLevel + 0.25);
        setVolumeLevel(v); _vol = v;
        speakText(`Volume ${Math.round(v * 100)} percent`, startSession);
        setHudMode('idle');
        return;
      }
      if (/^(volume down|quieter|turn down|softer|decrease volume)$/.test(cmd)) {
        const v = Math.max(0.1, volumeLevel - 0.25);
        setVolumeLevel(v); _vol = v;
        speakText(`Volume ${Math.round(v * 100)} percent`, startSession);
        setHudMode('idle');
        return;
      }

      // call controls
      if (/^(accept|answer the call|answer)$/.test(cmd) && showCallRef.current) {
        acceptCall(); startSession(); return;
      }
      if (/^(decline|reject|ignore|end call)$/.test(cmd) && showCallRef.current) {
        declineCall(); startSession(); return;
      }

      // weather shortcut
      if (/^(weather|show weather|what's the weather|temperature)$/.test(cmd)) {
        setShowWeather(v => !v);
        setHudMode('idle');
        startSession();
        return;
      }

      // ── TIME — answered from device clock ──
      if (/what.*time|current time|time is it|what's the time/i.test(text)) {
        const t = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
        const ans = `It's ${t}`;
        setAnswer(ans); setHudMode('answer'); setAnswerExiting(false); setShowScan(false);
        speakText(ans, startSession);
        return;
      }

      // ── VISUAL — Claude Vision with camera frame ──
      const frame = captureFrame(videoRef.current);
      const isVisual = frame && /\bsee\b|look|what.*\b(this|that|here|there|front|around)\b|describe|read this|scan/i.test(text);

      if (isVisual) {
        setShowScan(true);
        try {
          const ans = await askClaude(text, frame);
          setShowScan(false);
          setAnswer(ans); setHudMode('answer'); setAnswerExiting(false);
          speakText(ans, startSession);
        } catch {
          setShowScan(false);
          setAnswer('Could not see — please try again.');
          setHudMode('answer');
          startSession();
        }
        return;
      }

      // ── BRAIN — send to AI / action router ──
      setShowScan(false);
      const seq = nextSeq();
      const sent = sendToBrain({
        type: 'discrete', source: 'voice', text,
        sequence_id: seq, timestamp: new Date().toISOString(), is_final: true,
      });

      if (!sent) {
        // brain offline — fall back to direct Claude
        try {
          const ans = await askClaude(text, frame);
          setAnswer(ans); setHudMode('answer'); setAnswerExiting(false); setShowScan(false);
          setIsSpeaking(true);
          speakText(ans, () => { setIsSpeaking(false); startSession(); });
          outSeqRef.current += 1;
          glassChannel?.postMessage({ type: 'glass_query', seq_id: outSeqRef.current, id: `g${Date.now()}`, text, answer: ans, hasImage: !!frame });
        } catch {
          setShowScan(false);
          setAnswer('Could not reach AI. Check your connection.');
          setHudMode('answer');
          startSession();
        }
      }
      // if sent=true → response comes via lastCard useEffect which calls startSession
    };

    recog.onerror = (ev) => {
      // Mobile Chrome fires no-speech after ~2s — retry up to 4 times (~10s total window)
      if (ev.error === 'no-speech' && noSpeechRetries > 0) {
        setTimeout(() => startVoiceQuery(noSpeechRetries - 1), 150);
        return;
      }
      setVoiceActive(false); voiceActiveRef.current = false;
      if (inSessionRef.current) {
        setTimeout(() => {
          if (inSessionRef.current && !voiceActiveRef.current) startVoiceQuery();
        }, 600);
      } else {
        setHudMode('idle');
        startWakeListener();
      }
    };

    queryRecogRef.current = recog;
    recog.start();
  } // end _launchVoiceRecog

  function stopVoice() {
    queryRecogRef.current?.stop();
    setVoiceActive(false);
    voiceActiveRef.current = false;
    setWakeFlash(false);
    setHudMode('idle');
    setWakeListening(false);
    endSession(); // clears inSessionRef so the 900ms auto-listen timer can't relaunch voice query
    setTimeout(startWakeListener, 400);
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
      if (e.key === 'Escape') { if (document.fullscreenElement) document.exitFullscreen(); else { endSession(); dismissAnswer(); } }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line

  // ── render ──
  const wIcon  = weather ? (WMO_ICON[weather.weathercode] ?? '🌡') : null;
  const wLabel = weather ? (WMO[weather.weathercode] ?? '') : null;
  const isAnswer = hudMode === 'answer' && answer;

  return (
    <div className="glass-shell" style={{ filter: brightness !== 100 ? `brightness(${brightness}%)` : undefined }}>
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

      {/* ── CALL OVERLAY ── */}
      {showCall && callData && (
        <div className="call-overlay">
          {(() => {
            const brand = getAppBrand(callData.app);
            return (
              <div className="call-ring" style={{ background: brand.bg, borderColor: brand.border }}>
                <AppIcon app={callData.app} size={28} />
              </div>
            );
          })()}
          <div className="call-app" style={{ color: getAppBrand(callData.app).color }}>{callData.app}</div>
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

        {/* Notification toast */}
        {(() => {
          const brand = getAppBrand(notifData?.app);
          return (
            <div className={`hud-notification${showNotif && notifData ? ' visible' : ''}${!showNotif && notifData ? ' exiting' : ''}`}>
              <div className="notif-app-icon" style={{ background: brand.bg, border: `1px solid ${brand.border}` }}>
                <AppIcon app={notifData?.app || ''} size={15} />
              </div>
              <div className="notif-body">
                <div className="notif-app" style={{ color: brand.color }}>{notifData?.app}</div>
                <div className="notif-sender">{notifData?.sender}</div>
                <div className="notif-preview">{notifData?.preview}</div>
              </div>
              <div className="notif-hint">say "reply"</div>
            </div>
          );
        })()}

        {/* Status bar */}
        <div className="hud-top">
          <div className="hud-brand">ARVO <span className="dot-live" /></div>
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
            {weather && <div className="hud-stat weather-pill">{wIcon} {Math.round(weather.temperature)}°</div>}
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

        {/* ── CENTER ZONE ── */}
        <div className="hud-center">

          {/* Wake flash */}
          <div className={`wake-flash${wakeFlash ? ' visible' : ''}`}>
            <span className="wake-dot" />
            Hey ARVO
          </div>

          {/* Session active indicator */}
          <div className={`session-indicator${inSession && !voiceActive && hudMode !== 'listening' ? ' visible' : ''}`}>
            <span className="session-dot" />
            listening…
          </div>

          {/* Voice listening ring */}
          <div className={`subvocal-indicator${hudMode === 'listening' ? ' visible' : ''}`}>
            <div className="sv-ring">
              <div className="sv-wave">
                {[...Array(5)].map((_, i) => <div key={i} className="sv-bar" />)}
              </div>
            </div>
            <div className="sv-label">listening…</div>
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

          {/* App Home Grid */}
          {hudMode === 'idle' && !showMusic && !showWeather && (
            <div className="app-home-grid">
              <div className="app-grid-dots">
                {PAGE_TILES.map((_, i) => (
                  <span key={i} className={`grid-dot${gridPage === i ? ' active' : ''}`}
                    onClick={() => setGridPage(i)} style={{ pointerEvents: 'auto', cursor: 'pointer' }} />
                ))}
              </div>
              <div className="app-grid-slides" ref={slidesRef}
                onMouseDown={e => { e.preventDefault(); onGridDragStart(e.clientX); }}
                onMouseMove={e => onGridDragMove(e.clientX)}
                onMouseUp={e => onGridDragEnd(e.clientX)}
                onMouseLeave={e => onGridDragEnd(e.clientX)}
                onTouchStart={e => onGridDragStart(e.touches[0].clientX)}
                onTouchEnd={e => onGridDragEnd(e.changedTouches[0].clientX)}
              >
                <div className="app-grid-track" style={{
                  width: `${PAGE_TILES.length * 100}%`,
                  transform: `translateX(calc(-${gridPage * (100 / PAGE_TILES.length)}% + ${gridOffset}px))`,
                  transition: gridOffset !== 0 ? 'none' : 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)',
                }}>
                  {PAGE_TILES.map((tiles, pageIdx) => (
                    <div key={pageIdx} className="app-grid-page" style={{ width: `${100 / PAGE_TILES.length}%` }}>
                      {tiles.map(({ name, bg }) => (
                        <div key={name} className="app-tile" style={{ background: bg }}>
                          <div className="app-tile-icon"><AppIcon app={name} size={22} /></div>
                          <span className="app-tile-name">{name}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="ask-arvo-bar" onClick={startVoiceQuery} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
                <div className="ask-arvo-orb" />
                <span className="ask-arvo-text">Ask ARVO</span>
              </div>
            </div>
          )}

          {/* Full Music Player */}
          {showMusic && musicData && hudMode === 'idle' && (
            <div className="music-player-full">
              <div className="mpf-art">
                {musicData.albumArt
                  ? <img src={musicData.albumArt} alt="album" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:16}} />
                  : <AppIcon app={musicData.source || 'spotify'} size={52} />}
              </div>
              <div className="mpf-track">{musicData.track || 'Now Playing'}</div>
              <div className="mpf-artist">{musicData.artist || ''}</div>
              <div className="mpf-progress"><div className="mpf-fill" /></div>
              <div className="mpf-controls">
                <button className="mpf-btn" onClick={() => spotifyPrev()}>
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:20,height:20}}><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
                </button>
                <button className="mpf-btn mpf-play" onClick={() => spotifyPause()}>
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </button>
                <button className="mpf-btn" onClick={() => spotifyNext()}>
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:20,height:20}}><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* AI answer card */}
          {(isAnswer || answerExiting) && (
            <div
              className={`hud-answer-card${isAnswer && !answerExiting ? ' visible' : ''}${answerExiting ? ' exiting' : ''}`}
              onClick={dismissAnswer}
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
            >
              <div className="answer-card-topbar">
                <span className="answer-arvo-dot" />
                <span className="answer-arvo-label">ARVO</span>
                {isSpeaking && (
                  <span className="speaking-badge">
                    <span className="speak-dot" /><span className="speak-dot" /><span className="speak-dot" />
                  </span>
                )}
              </div>
              <div
                className="answer-card-text"
                ref={answerScrollRef}
                style={{ maxHeight: '32vh', overflowY: 'auto' }}
              >
                {answer}
              </div>
              <div className="answer-card-footer">
                {inSession
                  ? <><span className="session-dot" style={{marginRight:4}} /> listening…</>
                  : <>tap to dismiss</>
                }
              </div>
            </div>
          )}

          {/* Weather card */}
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

        {/* ── MAPS NAV CARD (Meta style) ── */}
        {navData && (
          <div className={`maps-nav-card${showNav ? ' visible' : ' exiting'}`}>
            <div className="maps-grid-overlay">
              {[...Array(6)].map((_, i) => <div key={i} className="maps-grid-line-h" style={{ top: `${(i+1)*16}%` }} />)}
              {[...Array(6)].map((_, i) => <div key={i} className="maps-grid-line-v" style={{ left: `${(i+1)*16}%` }} />)}
              <div className="maps-pin">
                <svg viewBox="0 0 24 24" fill="#EF4444" style={{width:18,height:18}}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              </div>
            </div>
            <div className="maps-info-card">
              <div className="maps-dest">{navData.dest || navData.street}</div>
              <div className="maps-sub">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:11,height:11,opacity:0.6}}><path d="M16 16l-4-4-4 4M12 12V3"/><path d="M20 21H4"/></svg>
                {navData.distance}{navData.eta ? ` · ETA ${navData.eta}` : ''}
              </div>
              <div className="maps-instruction">{navData.instruction} onto {navData.street}</div>
            </div>
          </div>
        )}
      </div>

      {/* Live voice transcript */}
      <div className={`voice-transcript${voiceTranscript ? ' visible' : ''}`}>
        {voiceTranscript}
      </div>

      {/* Wake word indicator */}
      <div className={`wake-indicator${wakeListening && !voiceActive && hudMode === 'idle' ? ' visible' : ''}`}>
        <span className="wake-ring" />
        {wakeTranscript ? wakeTranscript : 'hey arvo'}
      </div>

      {/* ── CONTROL PANEL TRIGGER STRIP ── */}
      <div className="cp-trigger-strip"
        onMouseDown={e => { cpDragY.current = e.clientY; }}
        onMouseUp={e => { if (cpDragY.current !== null && e.clientY - cpDragY.current > 18) { setShowCP(true); } else if (cpDragY.current !== null) { setShowCP(v => !v); } cpDragY.current = null; }}
        onTouchStart={e => { cpDragY.current = e.touches[0].clientY; }}
        onTouchEnd={e => { if (cpDragY.current !== null) { setShowCP(true); } cpDragY.current = null; }}
      />

      {/* ── CONTROL PANEL BACKDROP ── */}
      {showCP && <div className="cp-backdrop" onClick={() => setShowCP(false)} />}

      {/* ── CONTROL PANEL ── */}
      <div className={`control-panel${showCP ? ' visible' : ''}`}>
        {/* Quick tiles row */}
        <div className="cp-quick-row">
          {/* Mic */}
          <div className={`cp-quick-tile${cpMuted ? ' active-red' : ''}`} onClick={() => setCpMuted(m => !m)} style={{ pointerEvents: 'auto' }}>
            <div className="cp-tile-icon" style={{ background: cpMuted ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.1)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={cpMuted ? '#F87171' : 'rgba(255,255,255,0.8)'} strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}>
                {cpMuted
                  ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3M8 23h8"/></>
                  : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 23h8"/></>
                }
              </svg>
            </div>
            <span className="cp-tile-label">{cpMuted ? 'Muted' : 'Mic'}</span>
          </div>

          {/* DND */}
          <div className={`cp-quick-tile${cpDND ? ' active-amber' : ''}`} onClick={() => setCpDND(d => !d)} style={{ pointerEvents: 'auto' }}>
            <div className="cp-tile-icon" style={{ background: cpDND ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.1)' }}>
              <svg viewBox="0 0 24 24" fill={cpDND ? '#FBBF24' : 'none'} stroke={cpDND ? '#FBBF24' : 'rgba(255,255,255,0.8)'} strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            </div>
            <span className="cp-tile-label" style={{ color: cpDND ? '#FBBF24' : undefined }}>Do Not Disturb</span>
          </div>

          {/* Music */}
          <div className="cp-quick-tile" onClick={() => { setShowCP(false); triggerMusic(); }} style={{ pointerEvents: 'auto' }}>
            <div className="cp-tile-icon" style={{ background: 'rgba(29,185,84,0.15)', overflow: 'hidden', borderRadius: 8 }}>
              {musicData?.albumArt
                ? <img src={musicData.albumArt} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                : <svg viewBox="0 0 24 24" fill="#1DB954" style={{width:14,height:14}}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              }
            </div>
            <span className="cp-tile-label" style={{maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {musicData?.track || 'Music'}
            </span>
          </div>
        </div>

        {/* Wide tiles row */}
        <div className="cp-wide-row">
          {/* Volume */}
          <div className="cp-wide-tile">
            <div className="cp-wide-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" style={{width:16,height:16}}>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </div>
            <div>
              <div className="cp-wide-label">Volume</div>
              <div className="cp-vol-bars">
                {[...Array(8)].map((_, i) => <div key={i} className="cp-vol-bar" style={{ opacity: i < 5 ? 1 : 0.2 }} />)}
              </div>
            </div>
          </div>

          {/* Battery */}
          <div className="cp-wide-tile">
            <div className="cp-wide-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke={battery !== null && battery < 20 ? '#F87171' : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round" style={{width:16,height:16}}>
                <rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/>
              </svg>
            </div>
            <div>
              <div className="cp-wide-label">Battery</div>
              <div className="cp-wide-value" style={{ color: battery !== null && battery < 20 ? '#F87171' : '#34D399' }}>
                {battery !== null ? `${battery}%` : '–'}
              </div>
            </div>
          </div>
        </div>

        {/* Settings button (main view) */}
        {cpView === 'main' && (
          <div className="cp-settings-btn" onClick={() => setCpView('settings')} style={{ pointerEvents: 'auto' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14,flexShrink:0}}>
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span>Settings</span>
          </div>
        )}

        {/* Settings panel view */}
        {cpView === 'settings' && (
          <div className="cp-settings-panel">
            {/* Header */}
            <div className="cps-header">
              <button className="cps-back" onClick={() => setCpView('main')} style={{ pointerEvents: 'auto' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{width:14,height:14}}><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <span className="cps-title">Settings</span>
            </div>

            {/* Spotify */}
            <div className="cps-row">
              <div className="cps-row-left">
                <div className="cps-icon" style={{ background: 'rgba(29,185,84,0.15)' }}>
                  <AppIcon app="spotify" size={14} />
                </div>
                <div>
                  <div className="cps-label">Spotify</div>
                  <div className="cps-sub" style={{ color: spotifyConn ? '#1DB954' : 'rgba(255,255,255,0.3)' }}>
                    {spotifyConn ? 'Connected' : 'Not connected'}
                  </div>
                </div>
              </div>
              <button className="cps-action-btn" style={{ pointerEvents: 'auto', background: spotifyConn ? 'rgba(248,113,113,0.15)' : 'rgba(29,185,84,0.15)', color: spotifyConn ? '#F87171' : '#1DB954' }}
                onClick={() => { if (spotifyConn) { spotifyDisconnect(); setSpotifyConn(false); } else { spotifyLogin(); } }}>
                {spotifyConn ? 'Disconnect' : 'Connect'}
              </button>
            </div>

            {/* Brightness */}
            <div className="cps-row">
              <div className="cps-row-left">
                <div className="cps-icon" style={{ background: 'rgba(251,191,36,0.12)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}>
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                </div>
                <div>
                  <div className="cps-label">Brightness</div>
                  <div className="cps-sub">{brightness}%</div>
                </div>
              </div>
              <input type="range" min="30" max="100" value={brightness} className="cps-slider"
                onChange={e => setBrightness(Number(e.target.value))}
                style={{ pointerEvents: 'auto' }} />
            </div>

            {/* Wake word */}
            <div className="cps-row">
              <div className="cps-row-left">
                <div className="cps-icon" style={{ background: 'rgba(96,165,250,0.12)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" style={{width:14,height:14}}>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  </svg>
                </div>
                <div>
                  <div className="cps-label">Wake word</div>
                  <div className="cps-sub">"hey arvo"</div>
                </div>
              </div>
              <div className={`cps-toggle${wakeListening ? ' on' : ''}`} onClick={() => setWakeListening(w => !w)} style={{ pointerEvents: 'auto' }}>
                <div className="cps-toggle-thumb" />
              </div>
            </div>

            {/* Camera */}
            <div className="cps-row">
              <div className="cps-row-left">
                <div className="cps-icon" style={{ background: 'rgba(249,115,22,0.12)' }}>
                  <AppIcon app="camera" size={14} />
                </div>
                <div>
                  <div className="cps-label">Camera</div>
                  <div className="cps-sub" style={{ color: camReady ? '#34D399' : 'rgba(255,255,255,0.3)' }}>{camReady ? 'Active' : 'Off'}</div>
                </div>
              </div>
              <div className={`cps-toggle${camReady ? ' on' : ''}`} style={{ pointerEvents: 'auto', opacity: 0.5 }}>
                <div className="cps-toggle-thumb" />
              </div>
            </div>

            {/* About */}
            <div className="cps-about">
              <span className="cps-about-name">ARVO</span>
              <span className="cps-about-ver">v1.0 · claude-haiku-4-5</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
