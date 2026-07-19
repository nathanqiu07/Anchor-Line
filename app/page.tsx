import { AppShell } from "../components/app-shell";
import { UploadPanel } from "../components/upload-panel";

export default function Home() {
  return (
    <AppShell>
      <main className="landing-page">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__eyebrow">
            <span>College financial aid</span>
            <i aria-hidden="true" />
            <span>Decoded with receipts</span>
          </div>
          <h1 id="hero-title">Plain language{" "}<br />you can <em>check.</em></h1>
          <p>
            Upload an award letter. Anchor Lines separates gifts from debt, explains
            every dollar, and points each claim back to the source.
          </p>
          <div className="hero__rule" aria-hidden="true">
            <span>Source</span><i /><span>Claim</span><i /><span>Decision</span>
          </div>
        </section>
        <UploadPanel />
      </main>
    </AppShell>
  );
}
