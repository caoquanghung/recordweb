import type { CursorTrajectorySample } from './recording';

export const RECORDWEB_EXTENSION_CHANNEL = 'recordweb-extension-v1';
export const RECORDWEB_PRESENTATION_COMMAND_EVENT = 'recordweb-extension-presentation-command';

export interface ExtensionTargetTab {
  tabId: number;
  title: string;
}

export type ExtensionPresentationCommand =
  | 'start'
  | 'return-to-start'
  | 'toggle-pause'
  | 'stop'
  | 'end-session'
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
      reused: boolean;
    }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'CAPTURE_TARGET_RESOLVED';
      requestId: string;
      target: ExtensionTargetTab;
    }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'CAPTURE_TARGET_REJECTED';
      requestId: string;
      message: string;
    }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'CURSOR_STARTED';
      requestId: string;
      sessionId: string;
    }
  | {
      channel: typeof RECORDWEB_EXTENSION_CHANNEL;
      direction: 'extension-to-page';
      type: 'CURSOR_STOPPED';
      requestId: string;
      sessionId: string;
      lastSampleIndex: number;
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

interface PageToExtensionMessageBase {
  channel: typeof RECORDWEB_EXTENSION_CHANNEL;
  direction: 'page-to-extension';
}

export type PageToExtensionPayload =
  | { type: 'PAGE_READY' | 'PREPARE_CAPTURE_HANDLES' | 'FOCUS_APP' }
  | { type: 'OPEN_GOOGLE_SLIDES'; url: string }
  | { type: 'RESOLVE_CAPTURE_TARGET'; captureHandle: string; requestId: string }
  | { type: 'FOCUS_TARGET'; targetTabId: number }
  | { type: 'DISCONNECT'; targetTabId?: number }
  | {
      type: 'CURSOR_START';
      requestId: string;
      sessionId: string;
      targetTabId: number;
      offsetMs?: number;
      startIndex?: number;
    }
  | { type: 'CURSOR_PAUSE' | 'CURSOR_RESUME'; sessionId?: string; targetTabId?: number }
  | { type: 'CURSOR_STOP'; requestId: string; sessionId: string; targetTabId: number }
  | { type: 'CURSOR_RESET'; sessionId?: string; targetTabId?: number };

export type PageToExtensionMessage = PageToExtensionMessageBase & PageToExtensionPayload;
