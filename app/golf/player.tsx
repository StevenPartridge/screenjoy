'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PocketGolfElement } from '@screenjoy/pocket-golf/element';
import './prototype.css';

type GolfAPI = typeof import('@screenjoy/pocket-golf/element');

export function GolfPlayer() {
  const frame = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const element = useRef<PocketGolfElement | null>(null);
  const api = useRef<GolfAPI | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seed, setSeed] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [copyFallback, setCopyFallback] = useState('');

  useEffect(() => {
    let disposed = false;
    let game: PocketGolfElement | undefined;
    const syncHole = () => {
      if (!game) return;
      setAddress(game.holeAddress); setCopyFallback(''); setNotice('');
      const url = new URL(window.location.href);
      url.searchParams.set('hole', game.holeAddress);
      window.history.replaceState(null, '', url);
    };
    const syncStorage = () => setStorageNotice(game?.scoreSaved ? '' : 'Browser storage is unavailable. Your score lasts for this session.');
    import('@screenjoy/pocket-golf/element').then(service => {
      if (disposed) return;
      api.current = service; service.registerPocketGolf();
      const imported = new URL(window.location.href).searchParams.get('hole');
      const settings = imported ? service.settingsFromAddress(imported) : { seed: crypto.randomUUID().slice(0, 8) };
      if (!settings) {
        setError('That hole address is invalid or uses an unsupported version. Enter a seed or start a new course.');
        setReady(true); return;
      }
      game = document.createElement('pocket-golf') as PocketGolfElement;
      game.setAttribute('aria-label', 'Pocket golf');
      game.startCourse(settings);
      game.addEventListener('holechange', syncHole);
      game.addEventListener('scorechange', syncStorage);
      element.current = game; mount.current?.append(game);
      setSeed(game.seed); setReady(true); syncStorage();
    }).catch(() => { if (!disposed) setError('Golf could not load. Refresh to try again.'); });
    const sync = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      disposed = true; game?.removeEventListener('holechange', syncHole); game?.removeEventListener('scorechange', syncStorage);
      game?.remove(); element.current = null; document.removeEventListener('fullscreenchange', sync);
    };
  }, []);

  function startCourse(value: string) {
    const service = api.current;
    if (!service) return;
    const input = value.trim();
    const settings = /^g\d+:/.test(input) ? service.settingsFromAddress(input) : input ? { seed: input } : null;
    if (!settings) { setError('Enter a seed or a valid hole address.'); return; }
    // Reloading also recovers from an invalid initial link without mounting a second game.
    const url = new URL(window.location.href);
    url.searchParams.set('hole', service.holeAddress(service.normalizeSettings(settings)));
    if (!element.current) { window.location.assign(url); return; }
    element.current.startCourse(settings); element.current.play();
    setSeed(element.current.seed); setPaused(false); setError('');
  }
  async function copyHole() {
    const url = new URL('/golf', window.location.origin); url.searchParams.set('hole', address);
    try { await navigator.clipboard.writeText(url.href); setNotice('Hole link copied.'); setCopyFallback(''); }
    catch { setCopyFallback(url.href); setNotice('Select and copy the link below.'); }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === frame.current) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch { setNotice('Fullscreen is unavailable in this browser. You can keep playing here.'); }
  }
  return <section className="golf-player" aria-label="Pocket golf">
    <div className="golf-frame saver-frame" ref={frame}>
      <div className="golf-mount" ref={mount} />
      {!address && <div className="golf-loading">{error ? 'Choose a course below to begin.' : 'Mowing a hole…'}</div>}
      <button type="button" className="fullscreen-button" aria-label={fullscreen ? 'Exit Pocket Golf fullscreen' : 'Enter Pocket Golf fullscreen'} onClick={toggleFullscreen}>
        <span className="fullscreen-icon" aria-hidden="true"><span/><span/><span/><span/></span>
      </button>
    </div>
    <p className="golf-instructions">Drag the amber target to aim. Click Swing, choose power on either pass, then click in the green zone on the return.</p>
    <div className="golf-controls">
      <div className="golf-actions">
        <button type="button" disabled={!address} onClick={() => { const next = !paused; if (element.current) element.current.paused = next; setPaused(next); }} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" disabled={!address} onClick={() => element.current?.restart()}>Replay hole</button>
        <button type="button" disabled={!address} onClick={() => void copyHole()}>Copy hole link</button>
        <button type="button" disabled={!ready} onClick={() => startCourse(crypto.randomUUID().slice(0, 8))}>New course</button>
      </div>
      <form onSubmit={event => { event.preventDefault(); startCourse(seed); }}>
        <label htmlFor="golf-seed">Seed or hole address</label>
        <div className="golf-seed-row"><input id="golf-seed" value={seed} maxLength={300} onChange={event => setSeed(event.target.value)} autoComplete="off" spellCheck={false}/><button disabled={!ready} type="submit">Play</button></div>
      </form>
      <p className="golf-caption">Completed holes count toward your saved score. Hover over the score to see holes played.</p>
      {storageNotice && <p role="status" className="golf-notice">{storageNotice}</p>}
      {notice && <p role="status" className="golf-notice">{notice}</p>}
      {copyFallback && <input className="golf-copy-link" aria-label="Hole link to copy" value={copyFallback} readOnly onFocus={event => event.target.select()}/>}
      {error && <p role="alert" className="golf-notice">{error}</p>}
      <Link className="golf-lab-link" href={address ? `/golf/lab?hole=${encodeURIComponent(address)}` : '/golf/lab'}>Open this hole in the lab</Link>
    </div>
  </section>;
}
