import type { CursorTrajectorySample } from './recording';

export const RECORDWEB_EXTENSION_CHANNEL = 'recordweb-extension-v1';

export interface ExtensionTargetTab {
  tabId: number;
  title: string;
}

export type ExtensionToPageMessage =
  | { channel: typeof RECORDWEB_EXTENSION_CHANNEL; direction: 'extension-to-page'; type: 'BRIDGE_READY' }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'CAPTURE_OFFER';
      streamId: string;
      target: ExtensionTargetTab;
    }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'CURSOR_SAMPLE';
      sessionId: string;
      sample: CursorTrajectorySample;
      viewport: { width: number; height: number };
    }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'TARGET_ENDED' | 'EXTENSION_ERROR';
      message: string;
    };

export type PageToExtensionMessage = {
  channel: typeof RECORDWEB_EXTENSION_CHANNEL;
  direction: 'page-to-extension';
  type: 'PAGE_READY' | 'CURSOR_START' | 'CURSOR_PAUSE' | 'CURSOR_RESUME' | 'CURSOR_STOP' | 'CURSOR_RESET' | 'DISCONNECT';
  sessionId?: string;
  targetTabId?: number;
};
