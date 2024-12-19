import { ReactNode, useState } from "react";
import Link from "next/link";
import styles from "./DashboardLayout.module.scss";
import { RiFullscreenFill } from "react-icons/ri";
import { FaBars, FaTimes } from "react-icons/fa";

type DashboardLayoutProps = {
  children: ReactNode;
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.open : ''}`}>
        <div className={styles.logo}>Logo</div>
        <nav className={styles.nav}>
          <Link href="/" className={styles.active}>
            <RiFullscreenFill size={16} />
            Dashboard
          </Link>
          <Link href="/">
            <RiFullscreenFill size={16} />
            TBC
          </Link>
          <Link href="/">
            <RiFullscreenFill size={16} />
            TBC
          </Link>
        </nav>
        <div className={styles.bottomNav}>
          <Link href="/documentation">
            <RiFullscreenFill size={16} />
            Documentation
          </Link>
          <Link href="/explorer">
            <RiFullscreenFill size={16} />
            Masumi Explorer
          </Link>
        </div>
      </aside>
      <div className={`${styles.main} ${isSidebarOpen ? styles.open : ''}`} onClick={() => setIsSidebarOpen(false)}>
        <div className={styles.overlay} onClick={() => setIsSidebarOpen(false)}></div>
        <header className={styles.header}>
            <button className={styles.menuButton} onClick={(e) => {
              e.stopPropagation();
              setIsSidebarOpen(!isSidebarOpen);
            }}>
              {isSidebarOpen ? <FaTimes size={16} /> : <FaBars size={16} />}
            </button>
          <div className={styles.walletBalance}>
            Wallet Balance: X ADA X SUMI X USDM
          </div>
        </header>
        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
} 