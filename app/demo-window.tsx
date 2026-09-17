"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { clampWindowPosition } from './window-position.mjs';

type Position = { x: number; y: number };
const origin = { x: 0, y: 0 };

export function DemoWindow({ title, frameRef, children, paused, onPause }: {
  title: string;
  frameRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  paused: boolean;
  onPause: () => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const moveButton = useRef<HTMLButtonElement>(null);
  const positionRef = useRef<Position>(origin);
  const drag = useRef<{ pointer: number; x: number; y: number; position: Position } | null>(null);
  const moveStart = useRef<Position>(origin);
  const [position, setPosition] = useState(origin);
  const [moving, setMoving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [notice, setNotice] = useState('');
  const expanded = fullscreen || fallback;
  const expandedRef = useRef(false);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  const place = useCallback((next: Position) => {
    const node = shell.current;
    const stage = node?.closest('.hero-stage');
    if (!node || !stage) return;
    const rect = node.getBoundingClientRect();
    const previous = positionRef.current;
    const base = { left: rect.left - previous.x, top: rect.top - previous.y, width: rect.width, height: rect.height };
    const bounded = window.matchMedia('(max-width: 980px)').matches ? origin : clampWindowPosition(next, base, stage.getBoundingClientRect());
    positionRef.current = bounded;
    setPosition(bounded);
  }, []);

  function reset() { place(origin); setMoving(false); setNotice('Window position reset.'); }
  function beginMove() {
    moveStart.current = positionRef.current;
    setMoving(true);
    setNotice('Use arrow keys to move. Enter finishes. Escape cancels.');
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (expanded || window.matchMedia('(max-width: 980px)').matches || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, position: positionRef.current };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    place({ x: start.position.x + event.clientX - start.x, y: start.position.y + event.clientY - start.y });
  }
  async function toggleExpand() {
    if (fallback) { setFallback(false); return; }
    if (document.fullscreenElement === shell.current) { await document.exitFullscreen().catch(() => setNotice('Use Escape to leave fullscreen.')); return; }
    setMoving(false);
    drag.current = null;
    try {
      if (!shell.current?.requestFullscreen || !document.fullscreenEnabled) throw new Error('Fullscreen unavailable');
      await shell.current.requestFullscreen();
    } catch {
      setFallback(true);
      setNotice('Expanded within the page. Press Escape or Restore to return.');
    }
  }

  useEffect(() => {
    const node = shell.current;
    const sync = () => setFullscreen(document.fullscreenElement === node);
    const resize = () => { if (!expandedRef.current) place(positionRef.current); };
    const observer = new ResizeObserver(resize);
    if (node) observer.observe(node);
    document.addEventListener('fullscreenchange', sync);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); document.removeEventListener('fullscreenchange', sync); window.removeEventListener('resize', resize); };
  }, [place]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const inertNodes: Array<{ node: HTMLElement; inert: boolean }> = [];
    let branch: HTMLElement | null = shell.current;
    while (branch?.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          inertNodes.push({ node: sibling, inert: sibling.inert });
          sibling.setAttribute('inert', '');
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    const button = expandButton.current;
    button?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && fallback) { event.preventDefault(); setFallback(false); }
      if (event.key !== 'Tab') return;
      // Focusable custom-element hosts remain in the cycle; their shadow UI handles its own focus.
      const nodes = [...(shell.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]') ?? [])].filter(node => node.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !shell.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !shell.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const { node, inert } of inertNodes) node.toggleAttribute('inert', inert);
      document.removeEventListener('keydown', keydown, true);
      button?.focus();
    };
  }, [expanded, fallback]);

  return <div className={`window-shell demo-window${fallback ? ' demo-window-expanded' : ''}`} ref={shell}
    role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? title : undefined}
    style={{ transform: expanded ? 'none' : `translate(${position.x}px, ${position.y}px)` }}>
    <div className="window-titlebar demo-titlebar" onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <span className="demo-window-title">{title}</span>
      <div className="demo-window-actions">
        <button className="window-move" type="button" ref={moveButton} disabled={expanded} aria-pressed={moving} onClick={beginMove}
          onKeyDown={event => {
            if (!moving) return;
            const amount = event.shiftKey ? 32 : 8;
            const steps: Record<string, Position> = { ArrowLeft: {x: -amount,y: 0}, ArrowRight: {x: amount,y: 0}, ArrowUp: {x: 0,y: -amount}, ArrowDown: {x: 0,y: amount} };
            if (steps[event.key]) { event.preventDefault(); place({x: positionRef.current.x + steps[event.key].x, y: positionRef.current.y + steps[event.key].y}); }
            else if (event.key === 'Escape') { event.preventDefault(); place(moveStart.current); setMoving(false); setNotice('Move cancelled.'); }
            else if (event.key === 'Enter') { event.preventDefault(); setMoving(false); setNotice('Window placed.'); }
          }}>Move</button>
        <button className="window-reset" type="button" disabled={expanded} onClick={reset}>Reset position</button>
        <button type="button" onClick={onPause} aria-label={paused ? 'Resume scene' : 'Pause scene'}>{paused ? 'Play' : 'Pause'}</button>
        <button type="button" ref={expandButton} onClick={() => void toggleExpand()} aria-label={expanded ? `Exit ${title} full screen` : `View ${title} full screen`}>{expanded ? 'Restore' : 'Full screen'}</button>
      </div>
    </div>
    <div className="saver-frame" ref={frameRef}>{children}</div>
    <span className="sr-only" role="status">{notice}</span>
  </div>;
}
