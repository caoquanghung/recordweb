const DEFAULT_APP_URL = 'http://localhost:3000/';
const form = document.querySelector('#settings-form');
const input = document.querySelector('#app-url');
const status = document.querySelector('#status');

void chrome.storage.sync.get({ recordWebAppUrl: DEFAULT_APP_URL }).then(({ recordWebAppUrl }) => {
  input.value = recordWebAppUrl;
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const url = new URL(input.value);
    const supportedHost = url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname.endsWith('.vercel.app');
    if (!supportedHost || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('unsupported origin');
    }
    void chrome.storage.sync.set({ recordWebAppUrl: url.toString() }).then(() => {
      status.value = 'Saved. Future captures will open this RecordWeb URL.';
    });
  } catch {
    status.value = 'Use localhost, 127.0.0.1, or an https://*.vercel.app URL supported by the extension manifest.';
  }
});
