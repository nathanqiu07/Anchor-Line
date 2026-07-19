import Link from "next/link";

interface AppShellProps {
  children: React.ReactNode;
  compact?: boolean;
}

export function AppShell({ children, compact = false }: AppShellProps) {
  return (
    <div className={`app-shell${compact ? " app-shell--compact" : ""}`}>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Anchor Lines home">
          <span className="wordmark__anchor" aria-hidden="true">A</span>
          <span>Anchor Lines</span>
        </Link>
        <span className="site-header__descriptor">Financial aid, made checkable</span>
      </header>
      {children}
      <footer className="site-footer">
        <span>Anchor Lines explains award letters. It does not provide financial advice.</span>
        <span>Verify details with the school’s financial aid office.</span>
      </footer>
    </div>
  );
}
