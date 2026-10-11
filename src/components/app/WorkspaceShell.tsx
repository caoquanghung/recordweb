import type { ReactNode } from 'react';
import { AppNavigation, type AppSection } from './AppNavigation';
import styles from './WorkspaceShell.module.css';

interface WorkspaceShellProps {
  active: AppSection;
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({ active, eyebrow, title, description, actions, children }: WorkspaceShellProps) {
  return (
    <main className={styles.shell}>
      <AppNavigation active={active} />
      <section className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
        {children}
      </section>
    </main>
  );
}
