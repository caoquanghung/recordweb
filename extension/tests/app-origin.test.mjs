import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const homepageUrl = 'https://recordweb-nine.vercel.app/';

async function readExtensionFile(name) {
  return readFile(new URL(`../${name}`, import.meta.url), 'utf8');
}

test('RecordWeb bridge connects only on the homepage_url origin', async () => {
  const source = await readExtensionFile('recordweb-bridge.js');

  const runBridge = (origin) => {
    let connectCount = 0;
    const window = {
      location: { origin },
      addEventListener() {},
      postMessage() {},
    };
    const context = {
      URL,
      chrome: { runtime: { getManifest: () => ({ homepage_url: homepageUrl }) } },
      window,
      RecordWebExtensionProtocol: {
        CHANNEL: 'recordweb-extension-v1',
        PORT: { APP: 'recordweb-app' },
      },
      RecordWebResilientPort: {
        create: () => ({
          connect: () => { connectCount += 1; },
          send() {},
        }),
      },
    };
    context.globalThis = context;
    vm.runInNewContext(source, context);
    return connectCount;
  };

  assert.equal(runBridge('https://recordweb-nine.vercel.app'), 1);
  assert.equal(runBridge('http://localhost:3000'), 0);
  assert.equal(runBridge('https://recordweb-preview-coannoacs-projects.vercel.app'), 0);
});

test('service worker accepts app ports only from the homepage_url origin', async () => {
  const source = await readExtensionFile('service-worker.js');

  const runConnection = (url) => {
    let connectListener;
    const postedMessages = [];
    const noOpEvent = { addListener() {} };
    const context = {
      URL,
      setTimeout,
      clearTimeout,
      importScripts() {},
      RecordWebExtensionProtocol: {
        MESSAGE: {
          BRIDGE_READY: 'BRIDGE_READY',
          CURSOR_START: 'CURSOR_START',
          CURSOR_PAUSE: 'CURSOR_PAUSE',
          CURSOR_RESUME: 'CURSOR_RESUME',
          CURSOR_STOP: 'CURSOR_STOP',
          CURSOR_RESET: 'CURSOR_RESET',
        },
        PORT: { APP: 'recordweb-app', TRACKER: 'recordweb-tracker' },
      },
      RecordWebGoogleSlides: {
        SLIDES_TAB_QUERY: 'https://docs.google.com/presentation/*',
        deckKey: () => null,
        isEditablePresentUrl: () => false,
        parse: () => null,
      },
      chrome: {
        action: {
          onClicked: noOpEvent,
          setBadgeBackgroundColor: async () => undefined,
          setBadgeText: async () => undefined,
        },
        runtime: {
          getManifest: () => ({ homepage_url: homepageUrl }),
          onConnect: { addListener(listener) { connectListener = listener; } },
        },
        tabs: {
          onRemoved: noOpEvent,
          onUpdated: noOpEvent,
        },
      },
    };
    context.globalThis = context;
    vm.runInNewContext(source, context);

    connectListener({
      name: 'recordweb-app',
      sender: { tab: { id: 10, url } },
      postMessage(message) { postedMessages.push(message); },
      onMessage: noOpEvent,
      onDisconnect: noOpEvent,
    });
    return postedMessages;
  };

  assert.deepEqual(
    runConnection('https://recordweb-nine.vercel.app/studio').map(({ type }) => type),
    ['BRIDGE_READY'],
  );
  assert.equal(runConnection('http://localhost:3000/studio').length, 0);
  assert.equal(
    runConnection('https://recordweb-preview-coannoacs-projects.vercel.app/studio').length,
    0,
  );
});
