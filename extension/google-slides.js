(() => {
  if (globalThis.RecordWebGoogleSlides) return;

  const SLIDES_ORIGIN = 'https://docs.google.com';
  const SLIDES_TAB_QUERY = 'https://docs.google.com/presentation/*';
  const SLIDES_PATH = /^\/presentation\/(?:u\/\d+\/)?d\/[^/]+(?:\/|$)/;
  const EDITABLE_DECK_PATH = /^(\/presentation\/(?:u\/\d+\/)?d\/(?!e(?:\/|$))[^/]+)(?:\/(?:edit|view|preview|present))?\/?$/;
  const EDITABLE_PRESENT_PATH = /^\/presentation\/(?:u\/\d+\/)?d\/(?!e(?:\/|$))[^/]+\/present\/?$/;

  function parse(value) {
    try {
      const url = new URL(value);
      if (url.origin !== SLIDES_ORIGIN || !SLIDES_PATH.test(url.pathname)) return null;
      const editableDeckPath = url.pathname.match(EDITABLE_DECK_PATH);
      if (editableDeckPath) url.pathname = `${editableDeckPath[1]}/present`;
      return url;
    } catch {
      return null;
    }
  }

  function deckKey(value) {
    try {
      const url = new URL(value);
      if (url.origin !== SLIDES_ORIGIN) return null;
      const match = url.pathname.match(/^\/presentation\/(?:u\/\d+\/)?d\/(e\/)?([^/]+)/);
      if (!match) return null;
      return `${match[1] ? 'published' : 'deck'}:${match[2]}`;
    } catch {
      return null;
    }
  }

  function isEditablePresentUrl(value) {
    try {
      const url = new URL(value);
      return url.origin === SLIDES_ORIGIN && EDITABLE_PRESENT_PATH.test(url.pathname);
    } catch {
      return false;
    }
  }

  globalThis.RecordWebGoogleSlides = Object.freeze({
    SLIDES_TAB_QUERY,
    deckKey,
    isEditablePresentUrl,
    parse,
  });
})();
