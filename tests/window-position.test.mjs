import test from 'node:test';
import assert from 'node:assert/strict';
import { clampWindowPosition } from '../app/window-position.mjs';
const frame = {left: 100, top: 100, width: 400, height: 300};
const stage = {left: 0, top: 0, right: 800, bottom: 600};
test('dragging cannot lose a window beyond any stage edge', () => {
  assert.deepEqual(clampWindowPosition({x: 999,y: -999},frame,stage),{x: 300,y: -100});
  assert.deepEqual(clampWindowPosition({x: -999,y: 999},frame,stage),{x: -100,y: 200});
});
test('resize centers a window that no longer fits rather than inverting the bounds', () => {
  assert.deepEqual(clampWindowPosition({x: 999,y: -999},frame,{left:0,top:0,right:200,bottom:100}),{x:-200,y:-200});
});
