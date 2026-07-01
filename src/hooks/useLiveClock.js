import { useState, useEffect } from 'react';

function fmt(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(' AM', '').replace(' PM', '');
}

export default function useLiveClock() {
  const [time, setTime] = useState(fmt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(fmt(new Date())), 10000);
    return () => clearInterval(id);
  }, []);
  return time;
}
