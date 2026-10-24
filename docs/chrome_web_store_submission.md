# Chrome Web Store submission kit

This document contains the copy, reviewer context, and manual steps for publishing the RecordWeb Presentation Cursor extension.

## Build the upload package

Run:

```bash
npm run extension:package
```

The command creates:

```text
artifacts/chrome-web-store/recordweb-presentation-cursor-<version>.zip
```

The generated Store manifest differs intentionally from `extension/manifest.json`:

- It keeps only the canonical HTTPS RecordWeb origin from `homepage_url`.
- It keeps the Google Slides presentation origin.
- It removes localhost, `127.0.0.1`, and Vercel Preview wildcard access.
- It excludes tests, documentation, and the editable SVG icon source.

Continue using `extension/manifest.json` for unpacked local and Vercel Preview testing.

## Store listing

### Name

```text
RecordWeb Presentation Cursor
```

### Summary

```text
Track the presenter cursor in the Google Slides tab explicitly shared with RecordWeb.
```

### Detailed description

```text
RecordWeb Presentation Cursor connects a Google Slides tab to the RecordWeb browser recording studio.

After you select a Google Slides tab in Chrome's native share picker, the extension verifies that exact tab and records normalized cursor movement and click timing for the active recording session. This lets RecordWeb reconstruct the presenter's cursor alongside the finished recording.

Features:
- One-time installation with no extension click required for each session
- Exact shared-tab verification using Chrome Capture Handle
- Cursor movement and click-state capture during recording
- Start, pause, resume, microphone, camera, and end-session controls in the selected Slides tab
- Support for Google Slides browser fullscreen presentation
- Local-first processing; cloud upload occurs only when the user chooses to upload the recording

Chrome still requires the user to select and confirm the shared tab for each new display-capture stream.
```

### Category

Choose `Productivity`.

### Language

Choose the primary language used by the Store listing. English is the safest first submission because the current extension UI and reviewer notes are in English. A Vietnamese localized listing can be added afterward.

## Single purpose

```text
Track pointer position and clicks in the Google Slides tab explicitly shared with RecordWeb so the cursor can be reconstructed in the corresponding recording.
```

## Permission justifications

### `https://docs.google.com/presentation/*`

```text
Required to publish an opaque Capture Handle, verify the Google Slides tab explicitly selected in Chrome's share picker, track pointer coordinates and click state during an active RecordWeb recording, and display session controls in that selected presentation tab. The extension does not read slide text, credentials, cookies, or unrelated browsing activity.
```

### Canonical RecordWeb production origin

```text
Required to connect the RecordWeb Studio page to the extension. The bridge receives user-initiated recording commands and returns target-tab status and cursor samples. The production Store package does not request access to localhost, Vercel Preview deployments, or unrelated websites.
```

### Remote code

Select:

```text
No, I am not using remote code.
```

Explanation if the dashboard requests one:

```text
All executable extension JavaScript is included in the uploaded package. The extension does not fetch or evaluate remote JavaScript or WebAssembly.
```

## Data-use disclosure

Complete the dashboard fields truthfully using these facts:

- Cursor coordinates, click state, and timestamps are handled for the user-facing recording feature.
- The selected Google Slides URL or presentation identifier and an opaque Capture Handle are used only to pair the chosen tab.
- Cursor samples are sent to the RecordWeb page in the same browser through Chrome extension messaging.
- A finalized cursor trajectory is stored locally with the recording.
- It is uploaded with the recording only when the user explicitly chooses cloud upload.
- The extension does not sell data or use it for advertising, credit assessment, or unrelated analytics.
- The extension does not read slide text, passwords, form entries, or authentication cookies.

Privacy policy URL:

```text
https://recordweb-nine.vercel.app/privacy
```

The production deployment must contain the new `/privacy` route before submission.

## Reviewer notes

```text
Test prerequisites:
1. Use Chrome 116 or newer.
2. Open https://recordweb-nine.vercel.app/ and sign in.
3. Open any Google Slides presentation in another tab.
4. In RecordWeb Studio, connect camera and microphone, then choose Connect Google Slides.
5. Select the open Slides tab in Chrome's native share picker and click Share.
6. Confirm that the Studio preview remains connected.
7. Start recording from Studio or from the Ready to record control in the Slides tab.

Expected behavior:
- The extension resolves only the exact picker-selected Google Slides tab.
- Cursor capture starts only after RecordWeb starts recording.
- During recording, the Slides tab displays a compact session toolbar.
- End session finalizes cursor samples before disconnecting media.
- Browser display-sharing permission is never bypassed or persisted.

The extension has no popup. Clicking its toolbar icon opens or focuses the RecordWeb website.
```

Provide the reviewer with a dedicated test account if the production app requires authentication. Do not place a real password in this repository.

## Required graphical assets

Already prepared in the extension package:

- `extension/icons/icon-16.png`
- `extension/icons/icon-32.png`
- `extension/icons/icon-48.png`
- `extension/icons/icon-128.png`

Still capture manually from the production user flow:

1. RecordWeb Studio before connecting Slides.
2. Chrome share picker with a Google Slides tab selected.
3. Connected live preview in Studio.
4. Ready-to-record control in the Slides tab.
5. Recording toolbar in Google Slides browser fullscreen.

Use 1280×800 PNG or JPEG images with square corners and no outer padding. Upload at least one screenshot; three to five are recommended.

## Manual publisher steps

1. Register and verify a Chrome Web Store developer account.
2. Set the publisher name and support email.
3. Deploy the `/privacy` page to the production URL.
4. Runtime-test the generated Store package by loading its unpacked contents or a clean equivalent build.
5. Run `npm run extension:package` and upload the generated ZIP as a new item.
6. Add the listing text, icon, screenshots, privacy declarations, and reviewer notes above.
7. Start with `Private` visibility and add individual trusted tester accounts.
8. Submit for review.
9. After trusted-tester verification, switch to `Unlisted` or `Public` and submit that distribution change.

For every update, increment `version` in `extension/manifest.json` before generating a new ZIP. Chrome Web Store rejects a package whose version is not greater than the published version.

## Official references

- [Prepare an extension](https://developer.chrome.com/docs/webstore/prepare)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Privacy practices](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Distribution settings](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Listing requirements](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
