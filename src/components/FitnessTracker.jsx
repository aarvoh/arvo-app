import { useState, useEffect, useRef, useCallback } from 'react';
import glassChannel from '../lib/glassChannel';

// ─── constants ────────────────────────────────────────────────────────────────
const MAX_HR     = 185; // calibrate with age setting later
const WEIGHT_KG  = 70;
const ZONES = [
  { z: 1, name: 'Warm Up',   color: '#60A5FA', minPct: 50, maxPct: 60 },
  { z: 2, name: 'Fat Burn',  color: '#34D399', minPct: 60, maxPct: 70 },
  { z: 3, name: 'Cardio',    color: '#FBBF24', minPct: 70, maxPct: 80 },
  { z: 4, name: 'Anaerobic', color: '#F97316', minPct: 80, maxPct: 90 },
  { z: 5, name: 'Peak',      color: '#EF4444', minPct: 90, maxPct: 110 },
];
const WORKOUT_TYPES = [
  { type: 'run',      icon: '🏃', label: 'Run',      stride: 1.30 },
  { type: 'walk',     icon: '🚶', label: 'Walk',     stride: 0.75 },
  { type: 'cycle',    icon: '🚴', label: 'Cycle',    stride: 0    },
  { type: 'hiit',     icon: '⚡', label: 'HIIT',     stride: 0.90 },
  { type: 'yoga',     icon: '🧘', label: 'Yoga',     stride: 0    },
  { type: 'strength', icon: '💪', label: 'Strength', stride: 0    },
];

function getZone(bpm) {
  const pct = (bpm / MAX_HR) * 100;
  return ZONES.find(z => pct >= z.minPct && pct < z.maxPct) || ZONES[0];
}

function calcCalories(bpm, durSecs) {
  const pct = (bpm / MAX_HR) * 100;
  const met = pct >= 90 ? 11 : pct >= 80 ? 9 : pct >= 70 ? 7 : pct >= 60 ? 5 : 3.5;
  return Math.max(0, Math.round(met * WEIGHT_KG * durSecs / 3600));
}

function fmtTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

// ─── camera PPG ──────────────────────────────────────────────────────────────
function calcBPMFromSamples(samples) {
  if (samples.length < 90) return null;
  const vals = samples.map(s => s.v);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  if (std < 0.3) return null; // no finger on camera

  const normed = vals.map(v => (v - mean) / std);
  const peaks = [];
  for (let i = 2; i < normed.length - 2; i++) {
    if (normed[i] > 0.2 &&
        normed[i] >= normed[i - 1] && normed[i] >= normed[i - 2] &&
        normed[i] >= normed[i + 1] && normed[i] >= normed[i + 2]) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] > 8) peaks.push(i);
    }
  }
  if (peaks.length < 3) return null;

  const intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    const dt = samples[peaks[i]].t - samples[peaks[i - 1]].t;
    if (dt > 250 && dt < 1600) intervals.push(dt);
  }
  if (intervals.length < 2) return null;

  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round(60000 / avg);
  return bpm >= 40 && bpm <= 210 ? bpm : null;
}

// ─── component ────────────────────────────────────────────────────────────────
export default function FitnessTracker({ onClose }) {
  const [screen,       setScreen]       = useState('home');   // home | hr | workout | summary
  const [bpm,          setBpm]          = useState(0);
  const [bpmHistory,   setBpmHistory]   = useState([]);
  const [hrQuality,    setHrQuality]    = useState(0);        // 0-1
  const [camActive,    setCamActive]    = useState(false);
  const [camError,     setCamError]     = useState('');
  const [workoutType,  setWorkoutType]  = useState('run');
  const [duration,     setDuration]     = useState(0);
  const [steps,        setSteps]        = useState(0);
  const [calories,     setCalories]     = useState(0);
  const [summaryData,  setSummaryData]  = useState(null);

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const ppgTimerRef = useRef(null);
  const ppgSamples  = useRef([]);
  const bpmRef      = useRef(0);
  const stepsRef    = useRef(0);
  const durRef      = useRef(0);
  const wkTimerRef  = useRef(null);
  const motionRef   = useRef(null);
  const workoutTypeRef = useRef('run');
  useEffect(() => { workoutTypeRef.current = workoutType; }, [workoutType]);

  // ── camera PPG ──
  const startCameraPPG = useCallback(async () => {
    setCamError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width:  { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 30 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // torch
      const track = stream.getVideoTracks()[0];
      try { await track.applyConstraints({ advanced: [{ torch: true }] }); } catch {}
      setCamActive(true);
      ppgSamples.current = [];

      const canvas = canvasRef.current;
      canvas.width = 16; canvas.height = 16;
      const ctx = canvas.getContext('2d');

      ppgTimerRef.current = setInterval(() => {
        const vid = videoRef.current;
        if (!vid || !vid.videoWidth) return;
        ctx.drawImage(vid, 0, 0, 16, 16);
        const d = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0;
        for (let i = 0; i < d.length; i += 4) r += d[i];
        const avg = r / (d.length / 4);
        ppgSamples.current.push({ v: avg, t: Date.now() });
        if (ppgSamples.current.length > 450) ppgSamples.current.shift();

        if (ppgSamples.current.length > 90) {
          const raw = calcBPMFromSamples(ppgSamples.current);
          if (raw) {
            setBpm(raw);
            bpmRef.current = raw;
            setBpmHistory(h => [...h.slice(-59), raw]);
            // quality = std of red signal (>2 = finger present, good signal)
            const vals = ppgSamples.current.slice(-60).map(s => s.v);
            const m = vals.reduce((a,b)=>a+b,0)/vals.length;
            const std = Math.sqrt(vals.reduce((a,b)=>a+(b-m)**2,0)/vals.length);
            setHrQuality(Math.min(1, std / 8));
          }
        }
      }, 33);
    } catch (e) {
      setCamError(e.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera unavailable');
    }
  }, []);

  const stopCameraPPG = useCallback(() => {
    clearInterval(ppgTimerRef.current);
    const track = streamRef.current?.getVideoTracks()[0];
    try { track?.applyConstraints({ advanced: [{ torch: false }] }); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamActive(false);
    ppgSamples.current = [];
  }, []);

  // ── step counter ──
  const startStepCounter = useCallback(() => {
    let lastMag = 9.8, lastStep = 0;
    const handler = (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      const mag = Math.sqrt(g.x ** 2 + g.y ** 2 + g.z ** 2);
      const now = Date.now();
      if (mag > 13 && lastMag <= 13 && now - lastStep > 250) {
        stepsRef.current++;
        setSteps(stepsRef.current);
        lastStep = now;
      }
      lastMag = mag;
    };
    window.addEventListener('devicemotion', handler);
    motionRef.current = handler;
  }, []);

  const stopStepCounter = useCallback(() => {
    if (motionRef.current) window.removeEventListener('devicemotion', motionRef.current);
    motionRef.current = null;
  }, []);

  // ── broadcast helpers ──
  function broadcast(msg) {
    glassChannel?.postMessage(msg);
  }

  // ── start workout ──
  const startWorkout = useCallback(async (type) => {
    setWorkoutType(type);
    workoutTypeRef.current = type;
    durRef.current  = 0;
    stepsRef.current = 0;
    bpmRef.current  = 0;
    setDuration(0); setSteps(0); setCalories(0); setBpm(0); setBpmHistory([]);
    setScreen('workout');

    await startCameraPPG();
    startStepCounter();

    broadcast({ type: 'fitness_start', workoutType: type });

    wkTimerRef.current = setInterval(() => {
      durRef.current++;
      const d  = durRef.current;
      const b  = bpmRef.current || 75;
      const cal = calcCalories(b, d);
      const wt = workoutTypeRef.current;
      const stride = WORKOUT_TYPES.find(w => w.type === wt)?.stride ?? 0;
      const dist = parseFloat((stepsRef.current * stride / 1000).toFixed(2));
      setDuration(d);
      setCalories(cal);
      if (d % 2 === 0) {
        broadcast({
          type: 'fitness_update',
          bpm: b, zone: getZone(b).z,
          duration: d, calories: cal,
          steps: stepsRef.current, distance: dist,
          workoutType: wt, active: true,
        });
      }
    }, 1000);
  }, [startCameraPPG, startStepCounter]);

  const stopWorkout = useCallback(() => {
    clearInterval(wkTimerRef.current);
    stopCameraPPG();
    stopStepCounter();
    const wt  = workoutTypeRef.current;
    const stride = WORKOUT_TYPES.find(w => w.type === wt)?.stride ?? 0;
    setSummaryData({
      workoutType: wt,
      duration:    durRef.current,
      bpm:         bpmRef.current || 0,
      calories:    calcCalories(bpmRef.current || 75, durRef.current),
      steps:       stepsRef.current,
      distance:    parseFloat((stepsRef.current * stride / 1000).toFixed(2)),
    });
    setScreen('summary');
    broadcast({ type: 'fitness_stop' });
  }, [stopCameraPPG, stopStepCounter]);

  // ── listen for commands from glass ──
  useEffect(() => {
    const handle = (e) => {
      const msg = e.data;
      if (msg.type !== 'fitness_command') return;
      if (msg.cmd === 'start') startWorkout(msg.workoutType || 'run');
      if (msg.cmd === 'stop')  stopWorkout();
    };
    glassChannel?.addEventListener('message', handle);
    return () => glassChannel?.removeEventListener('message', handle);
  }, [startWorkout, stopWorkout]);

  // ── cleanup ──
  useEffect(() => () => {
    clearInterval(wkTimerRef.current);
    clearInterval(ppgTimerRef.current);
    stopCameraPPG();
    stopStepCounter();
  }, [stopCameraPPG, stopStepCounter]);

  // ── HR screen ──
  if (screen === 'hr') {
    const zone = bpm ? getZone(bpm) : null;
    return (
      <div className="ft-screen ft-hr">
        <div className="ft-top-bar">
          <button className="ft-back-btn" onClick={() => { stopCameraPPG(); setScreen('home'); }}>‹</button>
          <span className="ft-screen-title">Heart Rate</span>
        </div>

        <div className="ft-hr-display" style={{ '--zone-c': zone?.color || '#60A5FA' }}>
          <div className="ft-bpm-ring">
            <svg className="ft-ring-svg" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
              <circle cx="50" cy="50" r="44" fill="none" stroke={zone?.color || '#60A5FA'} strokeWidth="6"
                strokeDasharray="276.5" strokeDashoffset={bpm ? 276.5 * (1 - Math.min(1, (bpm - 40) / 160)) : 276.5}
                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}/>
            </svg>
            <div className="ft-bpm-inner">
              <span className="ft-bpm-num" style={{ color: zone?.color || 'rgba(255,255,255,0.4)' }}>
                {bpm || '--'}
              </span>
              <span className="ft-bpm-label">BPM</span>
              {zone && <span className="ft-bpm-zone" style={{ color: zone.color }}>{zone.name}</span>}
            </div>
          </div>
        </div>

        <div className="ft-hr-sparkline">
          {bpmHistory.slice(-40).map((v, i) => {
            const z = getZone(v);
            const h = Math.max(8, Math.min(100, ((v - 40) / 160) * 100));
            return <div key={i} className="ft-spark-bar" style={{ height: `${h}%`, background: z.color }} />;
          })}
        </div>

        <div className="ft-hr-quality">
          <div className="ft-quality-bar">
            <div className="ft-quality-fill" style={{ width: `${hrQuality * 100}%`, background: hrQuality > 0.5 ? '#34D399' : hrQuality > 0.2 ? '#FBBF24' : '#F87171' }} />
          </div>
          <span className="ft-quality-label">
            {hrQuality > 0.5 ? 'Good signal' : hrQuality > 0.2 ? 'Hold still…' : 'Place finger on rear camera'}
          </span>
        </div>

        {!camActive && !camError && (
          <button className="ft-primary-btn" onClick={startCameraPPG}>
            <svg viewBox="0 0 24 24" fill="currentColor" style={{width:16,height:16}}><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02z"/></svg>
            Start Camera
          </button>
        )}
        {camActive && (
          <button className="ft-secondary-btn" onClick={stopCameraPPG}>Stop</button>
        )}
        {camError && <div className="ft-error">{camError}</div>}

        <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    );
  }

  // ── workout active screen ──
  if (screen === 'workout') {
    const zone  = bpm ? getZone(bpm) : ZONES[0];
    const wt    = WORKOUT_TYPES.find(w => w.type === workoutType);
    const dist  = (steps * (wt?.stride ?? 0) / 1000).toFixed(2);

    return (
      <div className="ft-screen ft-active" style={{ '--zone-c': zone.color }}>
        <div className="ft-active-header">
          <div className="ft-active-type">{wt?.icon} {wt?.label?.toUpperCase()}</div>
          <div className="ft-active-timer">{fmtTime(duration)}</div>
          <button className="ft-stop-pill" onClick={stopWorkout}>■ Stop</button>
        </div>

        {/* Zone bar */}
        <div className="ft-zone-track">
          {ZONES.map(z => (
            <div key={z.z} className="ft-zone-seg" style={{ background: z.color, opacity: zone.z === z.z ? 1 : 0.15 }} />
          ))}
        </div>
        <div className="ft-zone-labels">
          {ZONES.map(z => (
            <span key={z.z} className={`ft-zone-lbl${zone.z === z.z ? ' cur' : ''}`} style={{ color: zone.z === z.z ? z.color : undefined }}>
              {z.name}
            </span>
          ))}
        </div>

        {/* BPM hero */}
        <div className="ft-hero-bpm" style={{ color: zone.color }}>
          <span className="ft-hero-num">{bpm || '--'}</span>
          <span className="ft-hero-unit">BPM</span>
        </div>

        {/* Sparkline */}
        <div className="ft-sparkline">
          {bpmHistory.slice(-50).map((v, i) => {
            const z = getZone(v);
            const h = Math.max(4, Math.min(100, ((v - 40) / 160) * 100));
            return <div key={i} className="ft-spark-bar" style={{ height: `${h}%`, background: z.color }} />;
          })}
        </div>

        {/* Stats */}
        <div className="ft-stats-row">
          <div className="ft-stat">
            <div className="ft-stat-val">{calories}</div>
            <div className="ft-stat-lbl">🔥 cal</div>
          </div>
          <div className="ft-stat">
            <div className="ft-stat-val">{steps.toLocaleString()}</div>
            <div className="ft-stat-lbl">👟 steps</div>
          </div>
          <div className="ft-stat">
            <div className="ft-stat-val">{dist}</div>
            <div className="ft-stat-lbl">📍 km</div>
          </div>
        </div>

        {/* HR quality */}
        <div className="ft-hr-status">
          <div className="ft-hr-dot" style={{ background: hrQuality > 0.4 ? '#34D399' : '#F87171' }} />
          <span>{hrQuality > 0.4 ? 'HR tracking ✓' : 'Finger on camera'}</span>
        </div>

        <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    );
  }

  // ── summary screen ──
  if (screen === 'summary' && summaryData) {
    const d = summaryData;
    const zone = d.bpm ? getZone(d.bpm) : ZONES[0];
    const wt = WORKOUT_TYPES.find(w => w.type === d.workoutType);
    return (
      <div className="ft-screen ft-summary">
        <div className="ft-summary-badge" style={{ background: zone.color }}>✓</div>
        <div className="ft-summary-title">Workout Complete</div>
        <div className="ft-summary-sub">{wt?.icon} {wt?.label} · {fmtTime(d.duration)}</div>

        <div className="ft-summary-grid">
          <div className="ft-summary-stat">
            <div className="ft-ss-val" style={{ color: zone.color }}>{d.bpm || '--'}</div>
            <div className="ft-ss-lbl">avg BPM</div>
          </div>
          <div className="ft-summary-stat">
            <div className="ft-ss-val">{d.calories}</div>
            <div className="ft-ss-lbl">calories</div>
          </div>
          <div className="ft-summary-stat">
            <div className="ft-ss-val">{d.steps.toLocaleString()}</div>
            <div className="ft-ss-lbl">steps</div>
          </div>
          <div className="ft-summary-stat">
            <div className="ft-ss-val">{d.distance}</div>
            <div className="ft-ss-lbl">km</div>
          </div>
        </div>

        <div className="ft-summary-zone">
          {zone && (
            <div className="ft-zone-chip" style={{ background: `${zone.color}20`, border: `1px solid ${zone.color}40`, color: zone.color }}>
              {zone.name} Zone
            </div>
          )}
        </div>

        <div className="ft-summary-actions">
          <button className="ft-primary-btn" onClick={() => setScreen('home')}>New Workout</button>
          <button className="ft-secondary-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  // ── home screen ──
  return (
    <div className="ft-screen ft-home">
      <div className="ft-top-bar">
        <button className="ft-back-btn" onClick={onClose}>‹</button>
        <span className="ft-screen-title">ARVO Fitness</span>
        <button className="ft-hr-quick-btn" onClick={() => { setScreen('hr'); startCameraPPG(); }}>
          <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          HR
        </button>
      </div>

      <div className="ft-home-bpm">
        <svg viewBox="0 0 24 24" fill="#EF4444" style={{width:18,height:18}}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span>ARVO Fitness tracks heart rate, steps, calories &amp; more</span>
      </div>

      <div className="ft-choose-label">Choose Workout</div>
      <div className="ft-type-grid">
        {WORKOUT_TYPES.map(({ type, icon, label }) => (
          <button key={type} className="ft-type-btn" onClick={() => startWorkout(type)}>
            <span className="ft-type-icon">{icon}</span>
            <span className="ft-type-lbl">{label}</span>
          </button>
        ))}
      </div>

      <div className="ft-home-tips">
        <div className="ft-tip">📷 Place finger on rear camera to measure heart rate</div>
        <div className="ft-tip">🎙️ Say "hey arvo start workout" to begin hands-free</div>
        <div className="ft-tip">👓 Live stats shown on your ARVO glass display</div>
      </div>
    </div>
  );
}
