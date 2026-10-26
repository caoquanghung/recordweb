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

The package command will not overwrite an existing ZIP for the same version. Version `0.4.9` is backed up in `extension/releases/`; copy each future ZIP there and commit or tag the matching source revision. For localhost testing, run `npm run extension:dev` and load `artifacts/extension-development/` in a separate browser profile; that build is never submitted to the Store.

The generated Store manifest is normalized from `extension/manifest.json`:

- It derives the canonical HTTPS RecordWeb origin from `homepage_url`.
- It keeps the Google Slides presentation origin.
- It rejects localhost, loopback, and broad Vercel wildcard access.
- It excludes tests, documentation, and the editable SVG icon source.

Load the generated package unpacked for the final production-origin runtime test before uploading the ZIP.

## Store listing

### Name

```text
RecordWeb Presentation Cursor
```

### Summary

```text
Capture a time-aligned presenter cursor from a Google Slides tab shared with RecordWeb.
```

### Detailed description

```text
RecordWeb Presentation Cursor connects a Google Slides tab to the RecordWeb browser recording studio.

After you select a Google Slides tab in Chrome's native share picker, the extension verifies that exact tab and records normalized cursor movement with active-recording timestamps. RecordWeb saves the cursor as a separate, synchronized asset alongside the recorded video and audio. This supports cursor playback and combining those sources for human-computer interaction (HCI) research.

Features:
- One-time installation with no extension click required for each session
- Exact shared-tab verification using Chrome Capture Handle
- Cursor movement capture with active-recording timestamps
- A separate cursor trajectory that can be combined with screen, camera, and audio recordings for HCI analysis
- Start, pause, resume, microphone, camera, and end-session controls in the selected Slides tab
- Support for Google Slides browser fullscreen presentation
- Local browser backup and an automatic cloud-save attempt after a recording finishes

Chrome still requires the user to select and confirm the shared tab for each new display-capture stream.
```

### Category

Choose `Productivity`.

### Language

Choose the primary language used by the Store listing. English is the safest first submission because the current extension UI and reviewer notes are in English. A Vietnamese localized listing can be added afterward.

## Single purpose

```text
Capture time-aligned pointer positions in the Google Slides tab explicitly shared with RecordWeb so its cursor trajectory can be synchronized with that session's media for playback and HCI analysis.
```

## Permission justifications

### `https://docs.google.com/presentation/*`

```text
Required to publish an opaque Capture Handle, verify the Google Slides tab explicitly selected in Chrome's share picker, track time-aligned pointer coordinates during an active RecordWeb recording, and display session controls in that selected presentation tab. The resulting cursor asset can be synchronized with the recorded media for playback and HCI analysis. The extension does not read slide text, credentials, cookies, or unrelated browsing activity.
```

### `https://recordweb-nine.vercel.app/*`

```text
Required to connect the RecordWeb Studio page to the extension. The bridge receives user-initiated recording commands and returns target-tab status and cursor samples. The Store package does not request access to localhost, other Vercel deployments, or unrelated websites.
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

- Cursor coordinates and active-recording timestamps are handled to create a separate trajectory synchronized with RecordWeb media for playback and HCI analysis.
- The selected Google Slides URL or presentation identifier and an opaque Capture Handle are used only to pair the chosen tab.
- Cursor samples are sent to the RecordWeb page in the same browser through Chrome extension messaging.
- A finalized cursor trajectory is stored locally with the recording.
- After recording finalization, RecordWeb automatically attempts to upload the recording and available assets, including cursor JSON, to Vercel Blob and saves metadata in Neon Postgres.
- Participants can export the synchronized source files and choose to send them to the research team; researchers may inspect the raw cursor, screen, camera, and audio files for HCI analysis. RecordWeb does not automatically transfer files to the team. The study collects written participant consent outside RecordWeb.
- Uploaded assets currently use public Blob URLs; RecordWeb page authorization does not prevent access by someone who has an asset URL.
- The extension does not sell data or use it for advertising, credit assessment, or unrelated analytics.
- The extension does not read slide text, passwords, form entries, or authentication cookies.

Privacy policy URL:

```text
https://recordweb-nine.vercel.app/privacy
```

The deployed site must serve this updated `/privacy` page before submission. Its cloud-upload and participant-export statements must match the Store listing and Privacy practices answers. Confirm that the separate written consent covers researcher access to the raw cursor, screen, camera, and audio files before the team inspects them; the current app has no in-app research consent flow.

## Reviewer notes

```text
Test prerequisites:
1. Use Chrome 116 or newer.
2. Open https://recordweb-nine.vercel.app/ and sign in.
3. Open a Google Slides presentation that you can access in another tab.
4. In RecordWeb Studio, connect camera and microphone, then choose Connect Google Slides.
5. Select the open Slides tab in Chrome's native share picker and click Share.
6. Confirm that the Studio preview remains connected.
7. Start recording from Studio or from the Ready to record control in the Slides tab.

Expected behavior:
- The extension resolves only the exact picker-selected Google Slides tab.
- Cursor capture starts only after RecordWeb starts recording.
- During recording, the Slides tab displays a compact session toolbar.
- End session finalizes cursor samples before disconnecting media.
- RecordWeb automatically attempts to save the finished recording and cursor asset to the cloud; local recovery remains available if that upload fails.
- Browser display-sharing permission is never bypassed or persisted.

The extension has no popup. Clicking its toolbar icon opens or focuses the RecordWeb website.
```

In the Chrome Web Store **Test instructions** tab, provide a dedicated `user` account's sign-in email, password, and any verification-code instructions. Test those instructions from a clean Chrome profile. If this deployment still uses Clerk Development, a `+clerk_test` email can use Clerk's `424242` email code when email-code verification is enabled. Do not place a real password in this repository. A Development instance is for testing and should be replaced with Clerk Production and an owned domain before a public launch; that domain change requires a new extension version and package.

The Store's Private/trusted-tester setting controls who can install the extension. It does not create a RecordWeb account for the reviewer.

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
3. Deploy the updated `/privacy` page and functional Studio to the canonical RecordWeb URL in the manifest.
4. Run `npm run extension:package`, then runtime-test that exact ZIP unpacked in a clean Chrome profile against the canonical site.
5. Upload the tested ZIP as a new Store item.
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
