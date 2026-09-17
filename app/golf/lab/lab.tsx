'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Hole, HoleSettings, HoleReview, Verdict, PocketGolfElement } from '@screenjoy/pocket-golf/element';
import '../prototype.css';
import './lab.css';

type GolfAPI = typeof import('@screenjoy/pocket-golf/element');
type Draft = { verdict: Verdict; tags: string[]; note: string };
const EMPTY_DRAFT: Draft = { verdict: 'tweak', tags: [], note: '' };
const SHAPES = { mixed: 'Weighted mix', straight: 'Straight', bend: 'Gentle bend', dogleg: 'Dogleg', islands: 'Islands' };
const HAZARDS = { mixed: 'Mixed hazards', none: 'No hazards', water: 'Water only', sand: 'Sand only' };
const VERSIONS = { g1: 'Original', g2: 'Larger water', g3: 'Rough buffer' } as const;
const VERDICTS = { keep: 'Keep it', tweak: 'Needs tuning', broken: 'Broken' };

export function GolfLab() {
  const api = useRef<GolfAPI | null>(null);
  const element = useRef<PocketGolfElement | null>(null);
  const mount = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drafts = useRef(new Map<string, Draft>());
  const currentHole = useRef<Hole | null>(null);
  const [ready, setReady] = useState(false);
  const [tags, setTags] = useState<readonly string[]>([]);
  const [hole, setHole] = useState<Hole | null>(null);
  const [settings, setSettings] = useState<HoleSettings>({ version: 'g3', seed: 'greenskeeper', index: 0, layout: 'mixed', hazards: 'mixed' });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [reviews, setReviews] = useState<HoleReview[]>([]);
  const [history, setHistory] = useState<HoleSettings[]>([]);
  const [notice, setNotice] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [error, setError] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [showRoute, setShowRoute] = useState(false);

  function loadHole(next: HoleSettings, remember = true) {
    const service = api.current, game = element.current;
    if (!service || !game) return;
    const generated = service.generateHole(next);
    if (!generated.validation.valid) { setError('This hole did not pass its playability check. Try another seed.'); return; }
    const previous = currentHole.current;
    if (remember && previous && previous.id !== generated.id) {
      setHistory(items => [...items.slice(-99), previous.settings]);
    }
    currentHole.current = generated;
    game.loadHole(generated);
    setHole(generated); setSettings(generated.settings);
    setDraft(drafts.current.get(generated.id) ?? { ...EMPTY_DRAFT });
    setError(''); setCopyFallback('');
    const url = new URL(window.location.href); url.searchParams.set('hole', generated.id);
    window.history.replaceState(null, '', url);
  }

  useEffect(() => {
    let disposed = false;
    import('@screenjoy/pocket-golf/element').then(service => {
      if (disposed) return;
      api.current = service; setReady(true); setTags(service.REVIEW_TAGS); service.registerPocketGolf();
      const game = document.createElement('pocket-golf') as PocketGolfElement;
      game.setAttribute('aria-label', 'Generated golf hole'); game.setAttribute('review', '');
      mount.current?.append(game); element.current = game;
      const address = new URL(window.location.href).searchParams.get('hole');
      const imported = address ? service.settingsFromAddress(address) : service.DEFAULT_SETTINGS;
      if (!imported) {
        setError('That hole address is invalid or uses an unsupported generator version. Choose settings and generate a hole.');
      } else loadHole(imported, false);
      try { setReviews(service.parseReviews(localStorage.getItem(service.REVIEW_STORAGE_KEY))); }
      catch { setStorageNotice('Browser storage is unavailable. Export your feedback before closing this page.'); }
    }).catch(() => setError('The hole lab could not load. Refresh to try again.'));
    const sync = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', sync);
    return () => { disposed = true; element.current?.remove(); element.current = null; document.removeEventListener('fullscreenchange', sync); };
    // Initial URL and storage are read once; navigation below uses explicit settings.
  }, []);

  function editDraft(next: Draft) {
    setDraft(next);
    if (hole) drafts.current.set(hole.id, next);
  }
  function nextHole() { loadHole({ ...(currentHole.current?.settings ?? settings), index: (currentHole.current?.settings.index ?? 0) + 1 }); setNotice(''); }
  function previousHole() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(history.slice(0, -1)); loadHole(previous, false); setNotice('');
  }
  function saveReview(andNext: boolean) {
    if (!hole || !api.current) return;
    const review = api.current.createReview(hole, element.current?.getSnapshot() ?? null, draft.verdict, draft.tags, draft.note);
    const updated = [review, ...reviews];
    setReviews(updated);
    try { localStorage.setItem(api.current.REVIEW_STORAGE_KEY, JSON.stringify(updated)); setStorageNotice(''); }
    catch { setStorageNotice('Feedback is saved in this tab only. Export it before closing the page.'); }
    drafts.current.delete(hole.id); setDraft({ ...EMPTY_DRAFT });
    if (andNext) nextHole();
    setNotice('Feedback saved. Use Copy all feedback to share it here.');
  }
  async function copy(text: string, success: string) {
    try { await navigator.clipboard.writeText(text); setNotice(success); setCopyFallback(''); }
    catch { setCopyFallback(text); setNotice('Select and copy the text below.'); }
  }
  function copyAll() {
    if (api.current) void copy(reviews.map(review => api.current!.reviewText(review, window.location.origin)).join('\n\n---\n\n'), 'Feedback copied. Paste it into our conversation.');
  }
  function exportReviews() {
    const blob = new Blob([JSON.stringify({ format: 'screenjoy-golf-feedback-v1', reviews }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'pocket-golf-feedback.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Feedback exported. You can attach the file to our conversation.');
  }
  async function toggleFullscreen() {
    try { if (document.fullscreenElement === frame.current) await document.exitFullscreen(); else await frame.current?.requestFullscreen(); }
    catch { setNotice('Fullscreen is unavailable. You can keep playing here.'); }
  }

  return <main className="golf-page golf-lab">
    <header className="lab-header"><div><Link href="/">screenjoy</Link><h1>Hole lab</h1></div><Link href="/golf">Play Pocket Golf</Link></header>
    <div className="lab-layout">
      <section className="lab-play" aria-label="Play the generated hole">
        <div className="golf-frame saver-frame" ref={frame}>
          <div className="golf-mount" ref={mount}/>
          {!hole && <div className="lab-loading">{error ? 'Generate a hole to begin.' : 'Mowing a hole…'}</div>}
          <button type="button" className="fullscreen-button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={toggleFullscreen}><span className="fullscreen-icon" aria-hidden="true"><span/><span/><span/><span/></span></button>
        </div>
        <div className="lab-navigation">
          <button type="button" onClick={previousHole} disabled={!history.length}>Previous</button>
          <button type="button" onClick={() => element.current?.restart()} disabled={!hole}>Replay hole</button>
          <button type="button" className="lab-primary" onClick={nextHole} disabled={!hole || hole.settings.index >= 999999}>Next hole →</button>
        </div>
        {hole && <div className="lab-hole-info"><span>{SHAPES[hole.shape === 'practice' ? 'straight' : hole.shape]} · Par {hole.par} · {hole.water.length} water · {hole.sand.length} sand</span><code>{hole.id}</code></div>}
        {hole && <div className="lab-comparison" role="group" aria-label="Compare terrain versions">{Object.entries(VERSIONS).map(([version, label]) => <button type="button" key={version} aria-pressed={hole.version === version} onClick={() => loadHole({ ...hole.settings, version: version as HoleSettings['version'] })}>{label}</button>)}</div>}
        <label className="lab-route"><input type="checkbox" checked={showRoute} onChange={event => { setShowRoute(event.target.checked); element.current?.toggleAttribute('show-route', event.target.checked); }}/> Show a checked landing route</label>
        <p className="lab-hint">Play as much of a hole as you like, then leave feedback or move on. Completed holes stay here for review. Scores are for this session.</p>
      </section>
      <aside className="lab-controls">
        <form className="lab-panel" onSubmit={event => { event.preventDefault(); loadHole(settings); setNotice(''); }}>
          <h2>Generate a hole</h2>
          <div className="lab-fields"><label>Seed<input value={settings.seed} maxLength={80} onChange={event => setSettings({ ...settings, seed: event.target.value })}/></label><label>Hole index<input type="number" min={0} max={999999} value={settings.index} onChange={event => setSettings({ ...settings, index: Number(event.target.value) })}/></label></div>
          <div className="lab-fields"><label>Shape<select value={settings.layout} onChange={event => setSettings({ ...settings, layout: event.target.value as HoleSettings['layout'] })}>{Object.entries(SHAPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Hazards<select value={settings.hazards} onChange={event => setSettings({ ...settings, hazards: event.target.value as HoleSettings['hazards'] })}>{Object.entries(HAZARDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <div className="lab-actions"><button type="submit" disabled={!ready}>Generate</button><button type="button" disabled={!hole} onClick={() => void copy(window.location.href, 'Hole link copied. It opens this exact layout.')}>Copy hole link</button></div>
          {hole?.validation.fallback && <p className="lab-warning">This seed used a fallback. Mention it in your feedback if its layout or hazards seem out of place.</p>}
        </form>
        <section className="lab-panel" aria-labelledby="feedback-title">
          <h2 id="feedback-title">How does this hole feel?</h2>
          <div className="lab-verdict" role="group" aria-label="Overall verdict">{Object.entries(VERDICTS).map(([value, label]) => <button type="button" key={value} aria-pressed={draft.verdict === value} onClick={() => editDraft({ ...draft, verdict: value as Verdict })}>{label}</button>)}</div>
          <div className="lab-tags">{tags.map(tag => <label key={tag}><input type="checkbox" checked={draft.tags.includes(tag)} onChange={event => editDraft({ ...draft, tags: event.target.checked ? [...draft.tags, tag] : draft.tags.filter(item => item !== tag) })}/>{tag}</label>)}</div>
          <label>Notes<textarea rows={4} maxLength={4000} placeholder="What worked? What would you change?" value={draft.note} onChange={event => editDraft({ ...draft, note: event.target.value })}/></label>
          <div className="lab-actions"><button type="button" disabled={!hole} onClick={() => saveReview(false)}>Save feedback</button><button type="button" className="lab-primary" disabled={!hole || hole.settings.index >= 999999} onClick={() => saveReview(true)}>Save & next →</button></div>
          <p className="lab-hint">Saves the exact hole, your notes, and the current ball and last-shot details in this browser. Copy or export to share them with me.</p>
        </section>
      </aside>
    </div>
    {(error || storageNotice || notice) && <div className="lab-notices">{error && <p role="alert">{error}</p>}{storageNotice && <p role="status">{storageNotice}</p>}{notice && <p role="status">{notice}</p>}</div>}
    {copyFallback && <label className="lab-copy">Copy this text<textarea readOnly rows={6} value={copyFallback} onFocus={event => event.target.select()}/></label>}
    <section className="lab-saved" aria-labelledby="saved-title">
      <div className="lab-saved-heading"><h2 id="saved-title">Saved feedback <span>{reviews.length}</span></h2><div className="lab-actions"><button type="button" disabled={!reviews.length} onClick={copyAll}>Copy all feedback</button><button type="button" disabled={!reviews.length} onClick={exportReviews}>Export JSON</button></div></div>
      {!reviews.length ? <p className="lab-hint">Your saved notes will appear here. You can return to any reviewed hole.</p> :
      <div className="lab-review-list">{reviews.map(review => <article key={review.id}><div><strong>{VERDICTS[review.verdict]}</strong><span>{review.summary.shape} · Par {review.summary.par}</span></div><code>{review.address}</code>{review.tags.length > 0 && <p className="lab-review-tags">{review.tags.join(' · ')}</p>}{review.note && <p>{review.note}</p>}<div className="lab-actions"><button type="button" onClick={() => { const parsed = api.current?.settingsFromAddress(review.address); if (parsed) { loadHole(parsed); if (api.current!.holeFingerprint(currentHole.current!) !== review.fingerprint) setNotice('This generator produced different geometry from the saved review. Include that mismatch in your feedback.'); } }}>Replay this hole</button><button type="button" onClick={() => api.current && void copy(api.current.reviewText(review, window.location.origin), 'Feedback copied. Paste it into our conversation.')}>Copy feedback</button></div></article>)}</div>}
    </section>
  </main>;
}
