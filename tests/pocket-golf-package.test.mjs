import assert from 'node:assert/strict';
import test from 'node:test';

// A small DOM adapter tests the published element lifecycle in Node. It does not
// render pixels or rely on the app, React, or a browser automation session.
class NodeElement extends EventTarget {
  attributes = new Map();
  children = [];
  style = {};
  isConnected = false;
  width = 256;
  height = 256;
  append(...children) { this.children.push(...children); }
  attachShadow() { this.shadowRoot = new NodeElement(); return this.shadowRoot; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) {
    const previous = this.getAttribute(name);
    this.attributes.set(name, String(value));
    if (this.constructor.observedAttributes?.includes(name)) this.attributeChangedCallback(name, previous, String(value));
  }
  removeAttribute(name) {
    const previous = this.getAttribute(name); this.attributes.delete(name);
    if (this.constructor.observedAttributes?.includes(name)) this.attributeChangedCallback(name, previous, null);
  }
  toggleAttribute(name, enabled) { if (enabled) this.setAttribute(name, ''); else this.removeAttribute(name); }
  getBoundingClientRect() { return { width: 400, height: 400, left: 0, top: 0 }; }
  getContext() { return new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) }); }
}
const registry = new Map();
globalThis.HTMLElement = NodeElement;
globalThis.customElements = { define: (name, type) => registry.set(name, type), get: name => registry.get(name) };
globalThis.document = Object.assign(new EventTarget(), {
  visibilityState: 'visible', fullscreenElement: null,
  createElement(name) { const Constructor = registry.get(name) ?? NodeElement; return new Constructor(); },
});
globalThis.window = Object.assign(new EventTarget(), {
  devicePixelRatio: 1,
  matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
});
globalThis.ResizeObserver = globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const values = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true,
  value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });

const pkg = await import('@screenjoy/pocket-golf');
function connect(element) { element.isConnected = true; element.connectedCallback(); }
function disconnect(element) { element.isConnected = false; element.disconnectedCallback(); }

test('a package import registers a playable element with all game UI inside its shadow root', () => {
  assert.equal(customElements.get('pocket-golf'), pkg.PocketGolfElement);
  pkg.registerPocketGolf(); // Repeated imports/registration are safe.
  const golf = document.createElement('pocket-golf');
  golf.setAttribute('seed', 'embedded'); golf.setAttribute('hole-index', '12');
  assert.equal(golf.seed, 'embedded'); assert.equal(golf.holeIndex, 12);
  connect(golf);
  assert.equal(golf.holeAddress, 'g3:embedded:12:mixed:mixed');
  assert.equal(golf.getSnapshot().phase, 'aim');
  assert.equal(golf.children.length, 0, 'no light-DOM app children are required');
  assert.ok(golf.shadowRoot.children.includes(golf.canvas));
  assert.ok(golf.shadowRoot.children.includes(golf.hud));
  assert.ok(golf.shadowRoot.children.includes(golf.score));
  assert.equal(golf.swing.textContent, 'Swing');
  golf.swing.dispatchEvent(new Event('click'));
  assert.equal(golf.getSnapshot().phase, 'power');
  golf.pause();
  assert.equal(golf.getSnapshot().phase, 'aim');
  assert.equal(golf.paused, true);
  golf.play();
  assert.equal(golf.paused, false);
  disconnect(golf);
});

test('attributes and properties configure installed elements before and after insertion', () => {
  const golf = document.createElement('pocket-golf');
  golf.seed = 'first'; golf.holeIndex = 4;
  connect(golf);
  assert.equal(golf.holeAddress, 'g3:first:4:mixed:mixed');
  golf.seed = 'second';
  assert.equal(golf.holeAddress, 'g3:second:4:mixed:mixed');
  golf.holeIndex = 96;
  assert.equal(golf.holeAddress, 'g3:second:96:mixed:mixed');
  const before = golf.getSnapshot();
  disconnect(golf); connect(golf);
  assert.deepEqual(golf.getSnapshot(), before);
  disconnect(golf);
  golf.seed = 'detached'; golf.holeIndex = 2;
  connect(golf);
  assert.equal(golf.holeAddress, 'g3:detached:2:mixed:mixed');
  assert.equal(golf.getSnapshot().phase, 'aim');
  disconnect(golf);
});

test('a host can finish a hole, receive events, and remount without an app or duplicate scoring', () => {
  const golf = document.createElement('pocket-golf');
  const changes = [];
  golf.addEventListener('holechange', event => changes.push(event.detail.address));
  connect(golf);
  const totals = golf.getTotals();
  // Finish through the element's normal completion pipeline. Physics and swing
  // timing are independently covered by the gameplay tests.
  golf.strokes = golf.hole.par - 1;
  golf.shot = { outcome: 'cup', end: { ...golf.hole.cup }, samples: [] };
  golf.finishShot();
  assert.equal(golf.feedback.textContent, 'Birdie · -1');
  assert.equal(golf.getTotals().holes, totals.holes + 1);
  const score = golf.getTotals();
  disconnect(golf); connect(golf);
  assert.deepEqual(golf.getTotals(), score);
  assert.equal(golf.getSnapshot().phase, 'complete');
  golf.updateFrame(2.2); golf.updateFrame(0.56);
  assert.equal(golf.holeIndex, 1);
  assert.equal(golf.getSnapshot().phase, 'aim');
  assert.ok(changes.includes('g3:greenskeeper:1:mixed:mixed'));
  disconnect(golf);
  const reloaded = document.createElement('pocket-golf');
  connect(reloaded);
  assert.deepEqual(reloaded.getTotals(), score);
  disconnect(reloaded);
});
