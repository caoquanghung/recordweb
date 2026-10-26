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
            The data is used only to reconstruct the presenter&apos;s cursor in the corresponding recording, verify the
            selected Google Slides tab, focus that tab when recording starts, and provide recording controls inside
            the selected presentation tab.
          </p>
        </section>

        <section>
          <h2>Storage and transmission</h2>
          <p>
            Cursor samples are sent through Chrome extension messaging to the RecordWeb page open in the same browser.
            The extension itself does not sell the data, use it for advertising, or send it to analytics providers.
          </p>
          <p>
            RecordWeb stores a completed cursor trajectory locally with the recording. If the user explicitly uploads
            that recording to RecordWeb cloud storage, the cursor trajectory may be uploaded with the recording to
            Vercel Blob, while associated recording metadata is stored in Neon Postgres. Network transfers use HTTPS.
          </p>
        </section>

        <section>
          <h2>Retention and deletion</h2>
          <p>
            Temporary tab mappings, Capture Handles, and live cursor samples are held only for the active browser
            session and are cleared when the session is disconnected, the tab closes, or the extension service worker
            is reset. Users can delete locally stored recordings from RecordWeb&apos;s Library and can delete uploaded
            recordings using the cloud recording controls.
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
            Data is used only to provide and maintain the user-facing recording feature described above. It is not
            transferred for advertising, credit assessment, surveillance, or sale. Service providers process data only
            when required to operate storage selected by the user.
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
