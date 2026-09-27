import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(appDir, 'package.json'));
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Bundle the real provider and rounds screen, replacing only native UI/device
// dependencies. Both screens and the provider share the same React instance.
const nativeMocks = {
  'react-native': `
    import React from 'react';
    const node = name => ({ children, ...props }) => React.createElement(name, props, children);
    export const ActivityIndicator = node('ActivityIndicator');
    export const Pressable = node('Pressable');
    export const ScrollView = node('ScrollView');
    export const Text = node('Text');
    export const View = node('View');
    export const Alert = { alert: (_title, _message, actions) => actions.find(action => action.text === 'Reset').onPress() };
    export const StyleSheet = { create: styles => styles };
  `,
  '@expo/vector-icons': `export const Feather = () => null;`,
  'expo-haptics': `
    export const NotificationFeedbackType = { Success: 'success' };
    export const selectionAsync = async () => {};
    export const notificationAsync = async () => {};
  `,
  '@/hooks/useColors': `export const useColors = () => ({});`,
  '@/components/AppUI': `
    import React from 'react';
    export const Screen = ({ children, right }) => React.createElement('Screen', null, right, children);
    export const Card = ({ children }) => React.createElement('Card', null, children);
    export const Pill = () => null;
    export const InstitutionPicker = () => null;
  `,
  '@react-native-async-storage/async-storage': `export default globalThis.__roundStorage;`,
};

const bundle = await build({
  stdin: {
    contents: `
      export { AppProvider, useApp } from './context/AppContext';
      export { default as Rounds } from './app/(tabs)/index';
      export { checklist } from './data/compliance';
    `,
    resolveDir: appDir,
    loader: 'tsx',
  },
  absWorkingDir: appDir,
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [{
    name: 'native-test-doubles',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, args =>
        Object.hasOwn(nativeMocks, args.path)
          ? { path: args.path, namespace: 'native-test-double' }
          : undefined
      );
      builder.onLoad({ filter: /.*/, namespace: 'native-test-double' }, args => ({
        contents: nativeMocks[args.path],
        loader: 'tsx',
        resolveDir: appDir,
      }));
    },
  }],
});

const storage = new Map();
const writes = [];
globalThis.__roundStorage = {
  getItem: async key => storage.get(key) ?? null,
  setItem: async (key, value) => { writes.push([key, value]); storage.set(key, value); },
};
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  require, module, module.exports
);
const { AppProvider, useApp, Rounds, checklist } = module.exports;

let current;
function Probe() {
  current = useApp();
  return React.createElement(Rounds);
}
let renderer;
async function mount() {
  await act(async () => {
    renderer = create(React.createElement(AppProvider, null, React.createElement(Probe)));
  });
  assert.equal(current.ready, true);
}
async function unmount() {
  await act(async () => renderer.unmount());
  current = undefined;
}
async function press(testID) {
  await act(async () => renderer.root.findByProps({ testID }).props.onPress());
}
async function change(fn) {
  await act(async () => fn(current));
}
function saved() {
  assert.ok(writes.length, 'round state was not written to AsyncStorage');
  assert.equal(new Set(writes.map(([key]) => key)).size, 1);
  return JSON.parse(storage.get(writes.at(-1)[0]));
}

test.beforeEach(() => { storage.clear(); writes.length = 0; });
test.afterEach(async () => { if (renderer) await unmount(); renderer = undefined; });

test('restores saved statuses and facility type when the provider remounts', async () => {
  await mount();
  await change(({ setInstitutionId }) => setInstitutionId('cah'));
  await press('complete-' + checklist[0].id);
  const previous = saved();
  assert.equal(previous.institutionId, 'cah');
  assert.equal(Object.values(previous.statuses)[0], 'complete');
  await unmount();
  await mount();
  assert.equal(current.institutionId, 'cah');
  assert.deepEqual(current.statuses, previous.statuses);
});

test('reset clears checks but keeps the selected facility type, including after remount', async () => {
  await mount();
  await change(({ setInstitutionId }) => setInstitutionId('snf'));
  await press('complete-' + checklist[0].id);
  await press('flag-' + checklist[1].id);
  assert.equal(Object.keys(current.statuses).length, 2);
  await press('reset-round');
  assert.equal(current.institutionId, 'snf');
  assert.deepEqual(current.statuses, {});
  assert.deepEqual(saved(), { institutionId: 'snf', statuses: {} });
  await unmount();
  await mount();
  assert.equal(current.institutionId, 'snf');
  assert.deepEqual(current.statuses, {});
});

test('complete and flagged controls toggle separately and persist each transition', async () => {
  const first = checklist[0].id;
  const second = checklist[1].id;
  await mount();
  await press('complete-' + first);
  await press('flag-' + second);
  assert.deepEqual(current.statuses, { [first]: 'complete', [second]: 'flagged' });
  await unmount();
  await mount();
  assert.deepEqual(current.statuses, { [first]: 'complete', [second]: 'flagged' });
  await press('complete-' + first);
  assert.deepEqual(current.statuses, { [first]: 'open', [second]: 'flagged' });
  await press('flag-' + second);
  assert.deepEqual(current.statuses, { [first]: 'open', [second]: 'open' });
  assert.deepEqual(saved().statuses, current.statuses);
  await unmount();
  await mount();
  assert.deepEqual(current.statuses, { [first]: 'open', [second]: 'open' });
});