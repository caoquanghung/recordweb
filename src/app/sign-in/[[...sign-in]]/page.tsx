import { SignIn } from '@clerk/nextjs';
import { Suspense } from 'react';
import styles from '../../auth.module.css';

export default function SignInPage() {
  return (
    <main className={styles.shell}>
      <Suspense fallback={<p className={styles.loading}>Loading sign in…</p>}>
        <SignIn />
      </Suspense>
    </main>
  );
}
