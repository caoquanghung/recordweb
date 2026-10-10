import { SignUp } from '@clerk/nextjs';
import { Suspense } from 'react';
import styles from '../../auth.module.css';

export default function SignUpPage() {
  return (
    <main className={styles.shell}>
      <Suspense fallback={<p className={styles.loading}>Loading registration…</p>}>
        <SignUp />
      </Suspense>
    </main>
  );
}
