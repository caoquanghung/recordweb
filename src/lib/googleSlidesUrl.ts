const GOOGLE_SLIDES_HOSTNAME = 'docs.google.com';
const GOOGLE_SLIDES_PATH = /^\/presentation\/(?:u\/\d+\/)?d\/[^/]+(?:\/|$)/;
const EDITABLE_DECK_PATH = /^(\/presentation\/(?:u\/\d+\/)?d\/(?!e(?:\/|$))[^/]+)(?:\/(?:edit|view|preview|present))?\/?$/;

export function parseGoogleSlidesUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:'
      || url.hostname !== GOOGLE_SLIDES_HOSTNAME
      || !GOOGLE_SLIDES_PATH.test(url.pathname)) {
      return null;
    }

    const editableDeckPath = url.pathname.match(EDITABLE_DECK_PATH);
    if (editableDeckPath) url.pathname = `${editableDeckPath[1]}/present`;
    return url;
  } catch {
    return null;
  }
}
