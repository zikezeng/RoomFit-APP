// Exercise the actual provider transitions and solver without a native renderer.
// Run: node scripts/test-multi-room.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
let slots = [], cursor = 0, current;
const react = {
  createContext: () => ({ Provider: 'Provider' }),
  createElement: (_, props) => { current = props.value; },
  useState: (init) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof init === 'function' ? init() : init;
    return [slots[index], (fn) => { slots[index] = typeof fn === 'function' ? fn(slots[index]) : fn; }];
  },
  useRef: (value) => ({ current: value }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
};
function load(file) {
  const base = path.resolve(file);
  file = ['', '.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!file) throw new Error('Missing module ' + base);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const localRequire = (id) => {
    if (id === 'react') return react;
    if (id.includes('utils/storage')) return { storage: {} };
    return load(id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id));
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
const store = load(path.join(root, 'src/state/plan-store.tsx'));
const { buildGeom } = load(path.join(root, 'src/lib/apartment.ts'));
const { validatePlan } = load(path.join(root, 'src/lib/multi-room.ts'));
const { generateLayouts, perUnitAllocation } = load(path.join(root, 'src/lib/solver.ts'));
const { getProduct } = load(path.join(root, 'src/lib/catalog.ts'));
function render() { cursor = 0; store.PlanProvider({ children: null }); return current; }
function act(fn) { fn(render()); return render(); }
act((c) => c.loadDemo());
const living = current.state.selectedRoomId;
const bedroom = current.state.apartment.rooms.find((r) => r.kind === 'bedroom').id;
const bathroom = current.state.apartment.rooms.find((r) => r.kind === 'bathroom').id;
act((c) => c.toggleRoom(bathroom));
assert.deepEqual([...current.state.selectedRoomIds], [living]);
// Single-room generation retains the original solver's products and geometry.
const original = generateLayouts({ geom: buildGeom(current.state.apartment, living), ...store.configOf(current.state), prefs: { styles: current.state.styles, moods: current.state.moods }, seed: 0 });
act((c) => c.generate(0));
assert.deepEqual(current.state.layouts.map((l) => l.items.map((i) => i.productId)), original.map((l) => l.items.map((i) => i.productId)));
assert.deepEqual(current.state.layouts.map((l) => l.items.map((i) => i.uid)), original.map((l) => l.items.map((i) => i.uid)));
const legacy = { ...current.state };
delete legacy.selectedRoomIds;
delete legacy.roomConfigs;
assert.deepEqual(store.restoreState(legacy).selectedRoomIds, [living]);
assert.deepEqual(store.restoreState(legacy).needs, legacy.needs);
act((c) => c.update({ needs: { floor_lamp: { qty: 1, priority: 'essential' } }, budget: 1100, allocations: { floor_lamp: 9 } }, 'all'));
act((c) => c.toggleRoom(bedroom));
act((c) => c.selectRoom(bedroom));
assert.equal(current.state.needsKind, 'bedroom');
assert.ok(current.state.needs.bed_frame);
act((c) => c.update({ needs: { floor_lamp: { qty: 2, priority: 'optional' } }, budget: 1900, allocations: { floor_lamp: 3 } }, 'all'));
act((c) => c.selectRoom(living));
assert.equal(current.state.needs.floor_lamp.qty, 1);
assert.equal(current.state.budget, 1100);
assert.equal(current.state.allocations.floor_lamp, 9);
act((c) => c.selectRoom(bedroom));
assert.equal(current.state.needs.floor_lamp.qty, 2);
assert.equal(current.state.budget, 1900);
assert.equal(perUnitAllocation(current.state.needs, current.state.allocations, 1900).floor_lamp, 950);
assert.equal(store.totalBudget(current.state), 3000);
// Shared preferences and persisted JSON retain both configurations.
act((c) => c.update({ styles: ['modern'] }, 'all'));
const restored = JSON.parse(JSON.stringify(current.state));
assert.equal(restored.roomConfigs[living].budget, 1100);
assert.equal(restored.roomConfigs[bedroom].budget, 1900);
assert.deepEqual(store.restoreState(restored).roomConfigs, restored.roomConfigs);
act((c) => c.generate(0));
const layout = current.state.layouts.find((l) => l.valid);
assert.ok(layout, 'Simple two-room configuration must produce a valid layout');
assert.equal(new Set(layout.items.map((i) => i.uid)).size, 3);
assert.ok(layout.items.every((i) => [living, bedroom].includes(i.roomId)));
assert.ok(validatePlan(current.state, layout.items).valid);
const lowRoomBudget = store.restoreState({ ...restored, roomConfigs: { ...restored.roomConfigs, [living]: { ...restored.roomConfigs[living], budget: 1 } } });
assert.equal(validatePlan(lowRoomBudget, layout.items).valid, false, 'Each room must satisfy its own budget');
assert.equal(validatePlan(current.state, layout.items.map((i, index) => index === 0 ? { ...i, cx: -1000 } : i)).valid, false, 'Furniture must stay inside its owning room');
act((c) => c.selectLayout(layout.id));
const before = JSON.stringify(current.state.plan.filter((i) => i.roomId === bedroom));
const item = current.state.plan.find((i) => i.roomId === living);
act((c) => { assert.ok(c.swap(item.uid, item.productId).valid); });
assert.equal(JSON.stringify(current.state.plan.filter((i) => i.roomId === bedroom)), before);
assert.equal(validatePlan(current.state, current.state.plan).total, current.state.plan.reduce((n, i) => n + getProduct(i.productId).price, 0));
act((c) => c.toggleRoom(living));
assert.equal(current.state.plan, null);
act((c) => c.generate(1));
assert.ok(current.state.layouts.every((l) => l.items.every((i) => i.roomId === bedroom)));
act((c) => c.toggleRoom(living));
act((c) => c.selectRoom(living));
assert.equal(current.state.budget, 1100);
assert.equal(current.state.needs.floor_lamp.qty, 1);
act((c) => c.update({ budget: 1200 }, 'layouts'));
assert.equal(current.state.plan, null);
act((c) => c.setApartment((ap) => ({ ...ap, rooms: ap.rooms.map((r) => r.id === bedroom ? { ...r, kind: 'dining', manualSqft: 150 } : r) })));
assert.equal(current.state.roomConfigs[bedroom].needsKind, 'dining');
assert.equal(current.state.apartment.rooms.find((r) => r.id === bedroom).manualSqft, 150);
act((c) => c.toggleRoom(living));
act((c) => c.toggleRoom(bedroom));
assert.equal(current.state.selectedRoomId, null);
assert.equal(current.state.selectedRoomIds.length, 0);
console.log('Passed: single-room solver parity, unsupported rooms, independent furniture/budgets, tabs, JSON persistence, combined validation, swaps, deselect/reselect, invalidation.');
