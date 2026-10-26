import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './privacy.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy | RecordWeb',
  description: 'How the RecordWeb Presentation Cursor extension handles cursor and presentation-tab data.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <article className={styles.policy}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/">RecordWeb</Link>
          <span>Chrome extension privacy policy</span>
          <h1>Privacy Policy</h1>
          <p>Last updated: October 26, 2026</p>
        </header>

        <section>
          <h2>Scope</h2>
          <p>
            This policy describes how the <strong>RecordWeb Presentation Cursor</strong> Chrome extension
            handles data while a user records a Google Slides presentation with RecordWeb.
          </p>
        </section>

        <section>
          <h2>Data the extension handles</h2>
          <ul>
            <li>Normalized pointer coordinates and timestamps during an active recording session.</li>
            <li>The Google Slides tab identity and presentation URL or identifier needed to bind RecordWeb to the tab the user explicitly shared.</li>
            <li>A random, opaque Capture Handle used to verify that the browser picker and cursor tracker refer to the same tab.</li>
            <li>Temporary extension connection and tab identifiers needed to start, pause, resume, stop, and finalize cursor capture.</li>
          </ul>
          <p>
            The extension does not read slide text, passwords, form entries, authentication cookies, or a user&apos;s
            general browsing history.
          </p>
        </section>

        <section>
          <h2>How the data is used</h2>
          <p>
            The extension uses tab identity and the Capture Handle to verify the selected Google Slides tab, focus
            it when recording starts, and provide in-tab recording controls. RecordWeb uses the time-aligned cursor
            trajectory for playback and to synchronize it with the session&apos;s video and audio sources. Participants
            can export these sources and send them to a research team for human-computer interaction (HCI) analysis.
          </p>
        </section>

        <section>
          <h2>Storage and transmission</h2>
          <p>
            Cursor samples are sent through Chrome extension messaging to the RecordWeb page open in the same browser.
            The extension itself does not sell the data, use it for advertising, or send it to analytics providers.
          </p>
          <p>
            RecordWeb stores a completed cursor trajectory locally with the recording. When recording finishes,
            RecordWeb automatically attempts to upload the recording and available source assets, including the
            cursor trajectory, to Vercel Blob. Associated recording metadata is stored in Neon Postgres. If the
            upload fails, the local recording remains available for recovery. Network transfers use HTTPS.
          </p>
          <p>
            Uploaded files use Vercel Blob public URLs. RecordWeb limits access to recording pages through account
            permissions, but anyone who obtains a file URL may be able to access that file directly.
          </p>
          <p>
            RecordWeb does not automatically send recordings to the research team. When a participant exports and
            sends recording files to the team, researchers may inspect the raw cursor, screen, camera, and audio
            data contained in those files for the study. That handoff is separate from RecordWeb&apos;s automatic
            cloud save. The study obtains written participant consent separately; RecordWeb does not collect or
            store that consent form.
          </p>
        </section>

        <section>
          <h2>Retention and deletion</h2>
          <p>
            Temporary tab mappings, Capture Handles, and live cursor samples are held only for the active browser
            session and are cleared when the session is disconnected, the tab closes, or the extension service worker
            is reset. Local recording backups remain in browser storage until removed or the browser&apos;s site data
            is cleared. Users can delete uploaded recordings using RecordWeb&apos;s cloud recording controls.
          </p>
        </section>

        <section>
          <h2>Permissions</h2>
          <p>
            The extension requests access only to the production RecordWeb website and Google Slides presentation
            pages. Google Slides access is required to publish the Capture Handle, track pointer movement, and display
            session controls. RecordWeb access is required to exchange session commands and cursor samples.
          </p>
        </section>

        <section>
          <h2>Third parties and limited use</h2>
          <p>
            Data is used to provide the synchronized recording and HCI analysis workflow described above. It is not
            transferred for advertising, credit assessment, surveillance, or sale. Service providers process data
            for RecordWeb authentication, recording storage, and metadata persistence. Participants may separately
            send exported files to the research team for the disclosed study purpose.
          </p>
          <p>
            RecordWeb&apos;s use and transfer of information handled by the extension adheres to the Chrome Web Store
            User Data Policy, including the Limited Use requirements.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy questions or deletion assistance, contact the developer through the support contact published
            on the RecordWeb Chrome Web Store listing.
          </p>
        </section>

        <footer>
          <Link href="/">Return to RecordWeb</Link>
        </footer>
      </article>
    </main>
  );
}
