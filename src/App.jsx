import { useState, useRef, useEffect } from 'react';
import './App.css';
import Home from './components/Home';
import Maps from './components/Maps';
import Settings from './components/Settings';
import GlassActivity from './components/GlassActivity';
import FitnessTracker from './components/FitnessTracker';
import { handleCallback, isConnected } from './lib/spotify';
import glassChannel from './lib/glassChannel';

const DEVICE_HEIGHT = 844;

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [activityOpen, setActivityOpen] = useState(false);
  const [openDragOffset, setOpenDragOffset] = useState(null);
  const [spotifyConnected, setSpotifyConnected] = useState(isConnected);

  const dragInfo = useRef({ active: false, startY: 0 });

  // Heartbeat to glass — runs on every screen so switching tabs never drops connection
  useEffect(() => {
    glassChannel.postMessage({ type: 'heartbeat_phone' });
    const id = setInterval(() => glassChannel.postMessage({ type: 'heartbeat_phone' }), 2000);
    return () => clearInterval(id);
  }, []);

  // Handle Spotify OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', '/');
      handleCallback(code)
        .then(() => setSpotifyConnected(true))
        .catch(console.error);
    }
  }, []);

  function onDragStart(clientY) {
    if (activityOpen) return;
    dragInfo.current = { active: true, startY: clientY };
  }

  useEffect(() => {
    function move(e) {
      if (!dragInfo.current.active) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = Math.max(0, clientY - dragInfo.current.startY);
      setOpenDragOffset(delta);
    }
    function end(e) {
      if (!dragInfo.current.active) return;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const delta = Math.max(0, clientY - dragInfo.current.startY);
      setActivityOpen(delta > DEVICE_HEIGHT * 0.28);
      dragInfo.current = { active: false, startY: 0 };
      setOpenDragOffset(null);
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
  }, []);

  return (
    <div className="device">
      {activeTab === 'home' && (
        <Home
          onOpenSettings={() => setActiveTab('settings')}
          onOpenActivity={() => setActivityOpen(true)}
          onNavigate={setActiveTab}
          spotifyConnected={spotifyConnected}
        />
      )}
      {activeTab === 'maps' && <Maps />}
      {activeTab === 'settings' && (
        <Settings
          spotifyConnected={spotifyConnected}
          onSpotifyChange={setSpotifyConnected}
        />
      )}
      {activeTab === 'fitness' && (
        <FitnessTracker onClose={() => setActiveTab('home')} />
      )}

      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" /></svg>
          <span>Home</span>
        </button>
        <button className={`tab-btn ${activeTab === 'fitness' ? 'active' : ''}`} onClick={() => setActiveTab('fitness')}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span>Fitness</span>
        </button>
        <button className={`tab-btn ${activeTab === 'maps' ? 'active' : ''}`} onClick={() => setActiveTab('maps')}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5 1.5L5 16 16 5l3 3L8 19" /></svg>
          <span>Maps</span>
        </button>
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
      </div>
      <div className="home-indicator" />

      <div
        className="drag-handle-zone"
        onMouseDown={(e) => onDragStart(e.clientY)}
        onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
        onClick={() => { if (!activityOpen) setActivityOpen(true); }}
      >
        <div className="drag-grip" />
      </div>

      <GlassActivity
        open={activityOpen}
        setOpen={setActivityOpen}
        openDragOffset={openDragOffset}
        spotifyConnected={spotifyConnected}
      />
    </div>
  );
}

