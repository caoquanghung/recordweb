'use client';

import { useState } from 'react';
import { AppSidebar, type AppSidebarBehavior, type AppSidebarItem } from './AppSidebar';
import styles from './SidebarShowcase.module.css';

const baseItems: AppSidebarItem[] = [
  { id: 'studio', label: 'Studio Giảng Bài', icon: 'studio', href: '/studio' },
  { id: 'library', label: 'Thư viện bài giảng', icon: 'library', href: '/library' },
];

export function SidebarShowcase() {
  const [behavior, setBehavior] = useState<AppSidebarBehavior>('adaptive');

  return (
    <div className={`${styles.showcase} ${behavior === 'fixed' ? styles.fixedLayout : styles.adaptiveLayout}`}>
      <AppSidebar behavior={behavior} activeHref="/library" items={baseItems} />

      <main className={styles.content}>
        <div className={styles.contentInner}>
          <span className={styles.eyebrow}>Component / Sidebar</span>
          <h1>Thanh điều hướng theo ngữ cảnh trang</h1>
          <p className={styles.lead}>
            Mỗi page quyết định cách sidebar xuất hiện bằng prop <code>behavior</code>. Navigation và tài khoản dùng
            chung một component, không sao chép markup giữa các route.
          </p>

          <section className={styles.modePanel} aria-labelledby="sidebar-mode-title">
            <div>
              <span className={styles.panelLabel}>Preview behavior</span>
              <h2 id="sidebar-mode-title">Chọn chế độ hiển thị</h2>
            </div>
            <div className={styles.segmentedControl} aria-label="Chế độ sidebar">
              {(['adaptive', 'fixed'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={behavior === mode ? styles.selectedMode : ''}
                  aria-pressed={behavior === mode}
                  onClick={() => setBehavior(mode)}
                >
                  {mode === 'adaptive' ? 'Adaptive' : 'Fixed'}
                </button>
              ))}
            </div>
          </section>

          <div className={styles.behaviorGrid}>
            <article>
              <span>01</span>
              <h2>Adaptive</h2>
              <p>Sticky trên desktop, chuyển thành drawer có backdrop và nút mở trên màn hình hẹp.</p>
              <code>{'<AppSidebar behavior="adaptive" />'}</code>
            </article>
            <article>
              <span>02</span>
              <h2>Fixed</h2>
              <p>Luôn ghim ở cạnh trái viewport. Page shell dành sẵn 288px cho vùng nội dung.</p>
              <code>{'<AppSidebar behavior="fixed" />'}</code>
            </article>
          </div>

          <aside className={styles.implementationNote}>
            <strong>Quy ước tích hợp</strong>
            <p>
              Page hoặc layout truyền mode một cách tường minh. Active item mặc định lấy từ URL hiện tại; prop
              <code> activeHref</code> chỉ dùng khi cần override như ở trang showcase này.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
