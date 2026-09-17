'use client';
import { useEffect, useRef } from 'react';
import type { HoleSettings, PocketGolfElement } from '@screenjoy/pocket-golf/element';

/** Connect the package to gallery controls; the game owns its own UI and state. */
export function GolfDemoElement({ course, paused, onHoleChange, onNotice }: {
  course: HoleSettings;
  paused: boolean;
  onHoleChange: (settings: HoleSettings, address: string) => void;
  onNotice: (notice: string) => void;
}) {
  const element = useRef<PocketGolfElement>(null);
  const firstCourse = useRef(true);
  const callbacks = useRef({ onHoleChange, onNotice, paused });
  useEffect(() => { callbacks.current = { onHoleChange, onNotice, paused }; });
  useEffect(() => {
    let disposed = false;
    const game = element.current;
    if (!game) return;
    const syncHole = (event: Event) => {
      const { settings, address } = (event as CustomEvent<{ settings: HoleSettings; address: string }>).detail;
      callbacks.current.onHoleChange(settings, address);
      const url = new URL(window.location.href);
      url.searchParams.set('saver', 'golf'); url.searchParams.set('hole', address);
      window.history.replaceState(null, '', url);
    };
    const syncStorage = () => callbacks.current.onNotice(game.scoreSaved ? '' : 'Browser storage is unavailable. Your score lasts for this session.');
    import('@screenjoy/pocket-golf/element').then(service => {
      if (disposed) return;
      const address = firstCourse.current ? new URL(window.location.href).searchParams.get('hole') : null;
      firstCourse.current = false;
      const settings = address ? service.settingsFromAddress(address) : course;
      service.registerPocketGolf();
      if (!settings) {
        game.pause(); callbacks.current.onNotice('That hole address is invalid. Choose a seed and play a course below.'); return;
      }
      game.addEventListener('holechange', syncHole); game.addEventListener('scorechange', syncStorage);
      game.startCourse(settings); game.paused = callbacks.current.paused; syncStorage();
    }).catch(() => { if (!disposed) callbacks.current.onNotice('Golf could not load. Refresh to try again.'); });
    return () => { disposed = true; game.removeEventListener('holechange', syncHole); game.removeEventListener('scorechange', syncStorage); };
  }, [course]);
  return <pocket-golf ref={element} className="hero-saver" paused={paused} aria-label="Pocket Golf" />;
}
