import type { CursorTrajectorySample } from './recording';

export const RECORDWEB_EXTENSION_CHANNEL = 'recordweb-extension-v1';
export const RECORDWEB_PRESENTATION_COMMAND_EVENT = 'recordweb-extension-presentation-command';

export interface ExtensionTargetTab {
  tabId: number;
  title: string;
}

export type ExtensionPresentationCommand =
  | 'toggle-pause'
  | 'stop'
  | 'toggle-microphone'
  | 'toggle-camera';

export type ExtensionToPageMessage =
  | { channel: typeof RECORDWEB_EXTENSION_CHANNEL; direction: 'extension-to-page'; type: 'BRIDGE_READY' }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'TARGET_READY';
      target: ExtensionTargetTab;
    }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'TARGET_OPENED';
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
      type: 'PRESENTATION_COMMAND';
      command: ExtensionPresentationCommand;
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
  type: 'PAGE_READY' | 'OPEN_GOOGLE_SLIDES' | 'FOCUS_TARGET' | 'CURSOR_START' | 'CURSOR_PAUSE' | 'CURSOR_RESUME' | 'CURSOR_STOP' | 'CURSOR_RESET' | 'DISCONNECT';
  sessionId?: string;
  targetTabId?: number;
  offsetMs?: number;
  startIndex?: number;
  url?: string;
};
