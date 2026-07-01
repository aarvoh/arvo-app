import { useState, useRef, useEffect } from 'react';
import { searchAndPlay, pause, next } from '../lib/spotify';
import glassChannel from '../lib/glassChannel';

const DEVICE_HEIGHT = 844;
const STORAGE_KEY = 'sotto_activity_v1';

function relativeTime(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function isToday(ts) {
  const d = new Date(ts), n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

const SEED_ENTRIES = [
  { id: 's5', kind: 'ai',    source: 'glass', cmd: '"what is this"',           meta: 'sub-vocal · camera frame', hasFrame: true,
    answer: "That's a Monstera deliciosa — bright indirect light, water weekly.", status: 'done', statusLabel: 'answered on lens', ts: Date.now() - 2 * 60000 },
  { id: 's4', kind: 'photo', source: 'glass', cmd: '"add this to insta story"', meta: 'captured on glass',
    photoStatus: 'pending', status: 'pending', statusLabel: 'awaiting confirmation', ts: Date.now() - 4 * 60000 },
  { id: 's3', kind: 'nav',   source: 'glass', cmd: '"navigate to MG Road"',    meta: 'voice · from glass',
    status: 'done', statusLabel: 'route sent to lens', ts: Date.now() - 22 * 60000 },
  { id: 's2', kind: 'ai',    source: 'glass', cmd: '"how much caffeine in this"', meta: 'sub-vocal · camera', hasFrame: true,
    answer: 'Around 95 mg per 250 ml — similar to a standard espresso.', status: 'done', statusLabel: 'answered on lens', ts: Date.now() - 38 * 60000 },
  { id: 's1', kind: 'music', source: 'glass', cmd: '"play something calm"',    meta: 'sub-vocal · Spotify',
    answer: 'Playing "Lofi Study Mix" on Spotify', status: 'done', statusLabel: 'playing on phone', ts: Date.now() - 60 * 60000 },
  { id: 's0', kind: 'err',   source: 'glass', cmd: '"reply to message"',       meta: 'low confidence match',
    status: 'failed', statusLabel: 'not recognized — try again', ts: Date.now() - 2 * 3600000 },
];

function loadEntries() {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return SEED_ENTRIES;
}

async function callAssistant(userText, imageBase64 = null) {
  const content = imageBase64
    ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
       { type: 'text', text: userText || 'What is this? Describe briefly.' }]
    : userText;
  const res = await fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.content;
}

const ICON_MAP = {
  ai:     { color: 'blue',    icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> },
  typed:  { color: 'blue',    icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> },
  vision: { color: 'blue',    icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> },
  nav:    { color: 'sage',    icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5 1.5L5 16 16 5l3 3L8 19"/></svg> },
  music:  { color: 'sage',    icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M7 13a5 5 0 0 1 10 0M9 17h6"/></svg> },
  photo:  { color: 'brass',   icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-4.5-4.5a2 2 0 0 0-2.8 0L4 19"/></svg> },
  err:    { color: 'red',     icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 9v4M12 17h.01"/></svg> },
};

const FILTERS = ['all', 'ai', 'nav', 'music', 'saved'];
const FILTER_LABEL = { all: 'All', ai: 'AI', nav: 'Nav', music: 'Music', saved: 'Saved' };
const FILTER_KINDS = { all: null, ai: ['ai','typed','vision'], nav: ['nav'], music: ['music'], saved: ['photo'] };

const QUICK_CHIPS = [
  { label: '👁 What do I see?', text: 'What is this?', camera: true },
  { label: '📍 Where am I?',    text: 'Where am I right now?', camera: false },
  { label: '🎵 Play something', text: 'play something calm', camera: false },
  { label: '🌡 Temperature?',   text: 'What is the temperature?', camera: false },
];

export default function GlassActivity({ open, setOpen, openDragOffset, spotifyConnected }) {
  const panelRef    = useRef(null);
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const recogRef    = useRef(null);
  const closeDragInfo = useRef({ active: false, startY: 0 });

  const [entries,       setEntries]       = useState(loadEntries);
  const [filter,        setFilter]        = useState('all');
  const [modalOpen,     setModalOpen]     = useState(false);
  const [modalEntry,    setModalEntry]    = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [toast,         setToast]         = useState(null);
  const [undoEntry,     setUndoEntry]     = useState(null);
  const [composerValue, setComposerValue] = useState('');
  const [cameraOpen,    setCameraOpen]    = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [listening,     setListening]     = useState(false);
  const [closeDragOffset, setCloseDragOffset] = useState(null);
  const [tick,          setTick]          = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
  }, [entries]);

  // ── BroadcastChannel: heartbeat + receive glass queries ──────────
  useEffect(() => {
    if (!glassChannel) return;

    // announce phone is alive immediately and every 5s
    glassChannel.postMessage({ type: 'heartbeat_phone' });
    const beatId = setInterval(() => glassChannel.postMessage({ type: 'heartbeat_phone' }), 5000);

    function handle(e) {
      const msg = e.data;
      if (msg.type === 'glass_query') {
        const newEntry = {
          id: msg.id || `g${Date.now()}`,
          kind: msg.hasImage ? 'vision' : 'ai',
          source: 'glass',
          cmd: `"${msg.text}"`,
          meta: msg.hasImage ? 'sub-vocal · glass camera' : 'sub-vocal · from glass',
          hasFrame: msg.hasImage,
          answer: msg.answer,
          status: 'done',
          statusLabel: 'answered on lens',
          ts: Date.now(),
        };
        setEntries(prev => prev.find(e => e.id === newEntry.id) ? prev : [newEntry, ...prev]);
      }
    }

    glassChannel.addEventListener('message', handle);
    return () => {
      clearInterval(beatId);
      glassChannel.removeEventListener('message', handle);
    };
  }, []);

  // ── camera ──────────────────────────────────────────────────────
  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 50);
    } catch { showToast('Camera access denied'); }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    closeCamera();
  }

  // ── voice ────────────────────────────────────────────────────────
  function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('Voice not supported in this browser'); return; }
    if (listening) { recogRef.current?.stop(); setListening(false); return; }
    const recog = new SR();
    recog.lang = 'en-US'; recog.interimResults = false;
    recog.onstart  = () => setListening(true);
    recog.onresult = e => setComposerValue(e.results[0][0].transcript);
    recog.onend    = () => setListening(false);
    recog.onerror  = () => setListening(false);
    recogRef.current = recog; recog.start();
  }

  function showToast(text, undo = null) {
    setToast(text); setUndoEntry(undo);
    setTimeout(() => { setToast(null); setUndoEntry(null); }, 3200);
  }

  // ── spotify commands ─────────────────────────────────────────────
  async function handleSpotifyCommand(text) {
    const lower = text.toLowerCase();
    const playMatch = lower.match(/^play\s+(.+)/);
    if (playMatch && spotifyConnected) {
      try {
        const track = await searchAndPlay(playMatch[1]);
        return track ? `Playing "${track.name}" by ${track.artists[0].name}.` : 'Could not find that on Spotify.';
      } catch (e) { return `Spotify error: ${e.message}`; }
    }
    if ((lower === 'pause' || lower === 'stop music') && spotifyConnected) { await pause(); return 'Paused Spotify.'; }
    if ((lower === 'next' || lower === 'skip') && spotifyConnected) { await next(); return 'Skipped to next track.'; }
    return null;
  }

  // ── send ─────────────────────────────────────────────────────────
  async function sendTyped() {
    const val = composerValue.trim();
    if (!val && !capturedImage) return;
    const hasImage = !!capturedImage, image = capturedImage;
    const id = `t${Date.now()}`;
    const newEntry = {
      id, kind: hasImage ? 'vision' : 'typed', source: 'phone',
      cmd: `"${val || 'identify this'}"`,
      meta: hasImage ? 'camera frame attached' : 'typed from phone',
      hasFrame: hasImage, capturedThumb: hasImage ? `data:image/jpeg;base64,${image}` : null,
      status: 'thinking', ts: Date.now(),
    };
    setEntries(prev => [newEntry, ...prev]);
    setComposerValue(''); setCapturedImage(null);
    try {
      const spotifyAnswer = !hasImage ? await handleSpotifyCommand(val) : null;
      const answer = spotifyAnswer || await callAssistant(val, image);
      setEntries(prev => prev.map(e =>
        e.id === id ? { ...e, answer, status: 'done', statusLabel: hasImage ? 'answered from camera' : 'answered here' } : e
      ));
    } catch (err) {
      setEntries(prev => prev.map(e =>
        e.id === id ? { ...e, answer: `Error: ${err.message}`, status: 'failed', statusLabel: 'failed' } : e
      ));
    }
  }

  function deleteEntry(id) {
    const entry = entries.find(e => e.id === id);
    setEntries(prev => prev.filter(e => e.id !== id));
    showToast('Entry removed', entry);
  }

  function undoDelete() {
    if (undoEntry) {
      setEntries(prev => {
        const exists = prev.find(e => e.id === undoEntry.id);
        if (exists) return prev;
        return [undoEntry, ...prev].sort((a, b) => b.ts - a.ts);
      });
      setToast(null); setUndoEntry(null);
    }
  }

  function updatePhotoStatus(id, status) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, photoStatus: status, statusLabel: status === 'saved' ? 'saved, not posted' : status === 'deleted' ? 'deleted' : e.statusLabel } : e));
  }

  function clearAll() {
    const old = entries;
    setEntries(SEED_ENTRIES.map(e => ({ ...e })));
    showToast('Activity cleared', { _isClearAll: true, old });
  }

  function undoClear() {
    if (undoEntry?._isClearAll) {
      setEntries(undoEntry.old);
      setToast(null); setUndoEntry(null);
    }
  }

  // ── drag-to-close ─────────────────────────────────────────────────
  function onCloseDragStart(clientY) { closeDragInfo.current = { active: true, startY: clientY }; }
  useEffect(() => {
    function move(e) {
      if (!closeDragInfo.current.active) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = Math.min(0, clientY - closeDragInfo.current.startY);
      setCloseDragOffset(DEVICE_HEIGHT + delta);
    }
    function end(e) {
      if (!closeDragInfo.current.active) return;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      setOpen(!(clientY - closeDragInfo.current.startY < -DEVICE_HEIGHT * 0.2));
      closeDragInfo.current = { active: false, startY: 0 };
      setCloseDragOffset(null);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchend', end);
    };
  }, [setOpen]);

  const liveDragOffset = openDragOffset != null ? openDragOffset : closeDragOffset;
  let panelStyle = {}, scrimStyle = {};
  if (liveDragOffset != null) {
    const pct = Math.max(0, Math.min(1, liveDragOffset / DEVICE_HEIGHT));
    panelStyle = { transform: `translateY(${-100 + pct * 100}%)`, transition: 'none' };
    scrimStyle = { opacity: pct, pointerEvents: pct > 0.02 ? 'auto' : 'none' };
  }

  // ── derived stats ────────────────────────────────────────────────
  const todayAll    = entries.filter(e => isToday(e.ts));
  const aiCount     = todayAll.filter(e => ['ai','typed','vision'].includes(e.kind)).length;
  const navCount    = todayAll.filter(e => e.kind === 'nav').length;
  const musicCount  = todayAll.filter(e => e.kind === 'music').length;
  const savedCount  = todayAll.filter(e => e.kind === 'photo' && e.photoStatus !== 'deleted').length;

  const filterKinds = FILTER_KINDS[filter];
  const visible = entries.filter(e => {
    if (e.kind === 'photo' && e.photoStatus === 'deleted') return filter === 'saved';
    if (!filterKinds) return true;
    return filterKinds.includes(e.kind);
  });
  const todayVisible  = visible.filter(e => isToday(e.ts));
  const olderVisible  = visible.filter(e => !isToday(e.ts));

  // ── render entry ─────────────────────────────────────────────────
  function renderEntry(entry) {
    const { color, icon } = ICON_MAP[entry.kind] || ICON_MAP.ai;
    const isPhoto = entry.kind === 'photo';
    const pStatus = entry.photoStatus;

    return (
      <div key={entry.id} className={`feed-row${isPhoto && pStatus === 'pending' ? ' pending' : ''}`}>
        <div className={`feed-icon ${color}`}>{icon}</div>

        <div className="feed-main">
          <div className="feed-cmd-row">
            <div className="feed-cmd">{entry.cmd}</div>
            <div className="feed-source-pill">
              {entry.source === 'glass'
                ? <><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="7" cy="12" rx="4" ry="3"/><ellipse cx="17" cy="12" rx="4" ry="3"/><path d="M11 11c.6-1 1.4-1 2 0"/></svg>glass</>
                : <><svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>phone</>}
            </div>
          </div>

          <div className="feed-meta-line">{entry.meta}</div>

          {(entry.hasFrame || entry.capturedThumb) && (
            <div className="feed-frame">
              {entry.capturedThumb
                ? <img src={entry.capturedThumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="capture" />
                : <>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9l4-2v10l-4-2"/></svg>
                    <span className="feed-frame-tag">glass camera frame</span>
                  </>}
            </div>
          )}

          {entry.status === 'thinking' && (
            <div className="feed-thinking">
              <span className="spinner" style={{ width: 11, height: 11, borderColor: 'rgba(96,165,250,0.25)', borderTopColor: 'var(--blue-bright)' }} />
              Asking AI…
            </div>
          )}

          {entry.answer && entry.status !== 'thinking' && (
            <div className={`feed-answer${entry.kind === 'music' || entry.kind === 'nav' ? ' sage-answer' : ''}`}>
              {entry.answer}
            </div>
          )}

          <div className="feed-meta">
            <span className="time">{relativeTime(entry.ts)}</span>
            {isPhoto && pStatus === 'pending' && (
              <span className="feed-status pending" style={{ cursor: 'pointer' }} onClick={() => { setModalEntry(entry); setModalOpen(true); }}>
                · tap to review →
              </span>
            )}
            {isPhoto && pStatus === 'saved'   && <span className="feed-status pending" onClick={() => { setDeleteTarget(entry); setDeleteModalOpen(true); }} style={{ cursor: 'pointer' }}>· saved · tap to delete</span>}
            {isPhoto && pStatus === 'posted'  && <span className="feed-status done">· posted to story</span>}
            {isPhoto && pStatus === 'deleted' && <span className="feed-status failed">· deleted</span>}
            {!isPhoto && entry.status === 'done'   && entry.statusLabel && <span className="feed-status done">· {entry.statusLabel}</span>}
            {!isPhoto && entry.status === 'failed' && entry.statusLabel && <span className="feed-status failed">· {entry.statusLabel}</span>}
          </div>
        </div>

        {isPhoto && pStatus === 'pending' && (
          <div className="pending-pill" onClick={() => { setModalEntry(entry); setModalOpen(true); }}>review</div>
        )}

        {!isPhoto && (
          <button className="entry-delete-btn" onClick={() => deleteEntry(entry.id)} title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} style={scrimStyle} onClick={() => setOpen(false)} />

      <div className={`panel ${open ? 'open' : ''}${liveDragOffset != null ? ' dragging' : ''}`} ref={panelRef} style={panelStyle}>

        <div className="panel-handle-row"
          onMouseDown={e => onCloseDragStart(e.clientY)}
          onTouchStart={e => onCloseDragStart(e.touches[0].clientY)}>
          <div className="panel-grip" />
        </div>

        {/* header */}
        <div className="panel-header">
          <div>
            <div className="panel-title">Glass activity</div>
            <div className="panel-stats-row">
              {todayAll.length > 0
                ? <>
                    <span className="pstat">{todayAll.length} today</span>
                    {aiCount > 0    && <span className="pstat blue">{aiCount} AI</span>}
                    {navCount > 0   && <span className="pstat sage">{navCount} nav</span>}
                    {musicCount > 0 && <span className="pstat sage">{musicCount} music</span>}
                    {savedCount > 0 && <span className="pstat brass">{savedCount} saved</span>}
                  </>
                : <span className="pstat">no activity today yet</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="clear-btn" onClick={clearAll}>Clear</button>
            <button className="panel-close-btn" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* filter tabs */}
        <div className="filter-tab-row">
          {FILTERS.map(f => (
            <button key={f} className={`filter-tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}
              {f === 'saved' && savedCount > 0 && <span className="filter-tab-dot" />}
            </button>
          ))}
        </div>

        {/* feed */}
        <div className="activity-feed">
          {visible.length === 0 && (
            <div className="feed-empty">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="7" cy="12" rx="4" ry="3"/><ellipse cx="17" cy="12" rx="4" ry="3"/><path d="M11 11c.6-1 1.4-1 2 0"/></svg>
              {filter === 'all' ? 'No activity yet — start by asking the glass something' : `No ${FILTER_LABEL[filter].toLowerCase()} activity today`}
            </div>
          )}
          {todayVisible.length > 0  && <div className="day-label">TODAY</div>}
          {todayVisible.map(renderEntry)}
          {olderVisible.length > 0  && <div className="day-label">EARLIER</div>}
          {olderVisible.map(renderEntry)}
        </div>

        {/* composer */}
        <div className="activity-composer">
          <div className="quick-chips-row">
            {QUICK_CHIPS.map(c => (
              <div key={c.label} className="quick-ask-chip" onMouseDown={() => {
                setComposerValue(c.text);
                if (c.camera) openCamera();
              }}>
                {c.label}
              </div>
            ))}
          </div>

          {capturedImage && (
            <div className="composer-thumb-row">
              <img src={`data:image/jpeg;base64,${capturedImage}`} className="composer-thumb" alt="capture" />
              <button className="composer-thumb-remove" onClick={() => setCapturedImage(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}

          <div className="composer-row">
            <input
              type="text"
              placeholder={capturedImage ? 'Ask about this image…' : 'Ask the assistant…'}
              value={composerValue}
              onChange={e => setComposerValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendTyped(); }}
            />
            <button className={`composer-icon-btn${listening ? ' active' : ''}`} onClick={toggleVoice} title="Voice input">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3"/>
              </svg>
            </button>
            <button className="composer-icon-btn" onClick={openCamera} title="Attach camera frame">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <button className="send-btn" onClick={sendTyped}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </button>
          </div>

          <div className="composer-hint">
            {spotifyConnected ? 'Try "play chill beats" · "pause" · or ask anything' : 'Sub-vocal queries from the glass land here'}
          </div>
        </div>
      </div>

      {/* camera overlay */}
      {cameraOpen && (
        <div className="camera-overlay">
          <button className="camera-close" onClick={closeCamera}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          <button className="camera-capture" onClick={captureFrame}><div className="camera-capture-inner" /></button>
          <div className="camera-hint">Tap to capture for AI analysis</div>
        </div>
      )}

      {/* post confirmation modal */}
      <div className={`modal-wrap ${modalOpen ? 'show' : ''}`}>
        <div className="modal-scrim" onClick={() => setModalOpen(false)} />
        <div className="modal-sheet">
          <div className="modal-grip" />
          <div className="modal-eyebrow">PENDING · INSTAGRAM STORY</div>
          <div className="modal-title">Post this to your story?</div>
          <div className="media-preview">
            <span className="media-tag">captured on glass · 0:08</span>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 9l4-2v10l-4-2"/></svg>
          </div>
          <div className="caption-box">
            <div className="caption-label">CAPTION · SUB-VOCALIZED</div>
            <div className="caption-text">golden hour at the lake</div>
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--brass-dim)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--brass-bright)', lineHeight: 1.5 }}>
            Instagram posting requires a Business account + Meta App Review. Connect in Settings → Services.
          </div>
          <div className="modal-actions">
            <button className="btn-discard" onClick={() => { setModalOpen(false); if (modalEntry) updatePhotoStatus(modalEntry.id, 'saved'); }}>Save, don't post</button>
            <button className="btn-confirm" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              Connect Instagram
            </button>
          </div>
        </div>
      </div>

      {/* delete modal */}
      <div className={`modal-wrap ${deleteModalOpen ? 'show' : ''}`}>
        <div className="modal-scrim" onClick={() => setDeleteModalOpen(false)} />
        <div className="modal-sheet" style={{ paddingBottom: 24 }}>
          <div className="modal-grip" />
          <div className="modal-eyebrow">SAVED, NOT POSTED</div>
          <div className="modal-title">Delete this capture?</div>
          <div className="caption-box" style={{ marginTop: 16 }}>
            <div className="caption-label">CAPTION · SUB-VOCALIZED</div>
            <div className="caption-text">golden hour at the lake</div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--paper-faint)', marginTop: 14, lineHeight: 1.6 }}>
            This stays in your phone's storage until you delete it. It will never post on its own.
          </p>
          <div className="modal-actions">
            <button className="btn-discard" onClick={() => setDeleteModalOpen(false)}>Keep it</button>
            <button className="btn-confirm danger" onClick={() => { setDeleteModalOpen(false); if (deleteTarget) updatePhotoStatus(deleteTarget.id, 'deleted'); showToast('Capture deleted'); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* toast with undo */}
      <div className={`toast ${toast ? 'show' : ''}`} style={undoEntry ? { cursor: 'pointer' } : {}}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        <span style={{ flex: 1 }}>{toast}</span>
        {undoEntry && (
          <span className="toast-undo" onClick={undoEntry._isClearAll ? undoClear : undoDelete}>Undo</span>
        )}
      </div>
    </>
  );
}
