"use client";

import { FormEvent, useState } from "react";

const platforms = [
  { name: "YouTube", detail: "Video & music playlists", mark: "Y", className: "youtube" },
  { name: "Spotify", detail: "Playlist metadata", mark: "S", className: "spotify" },
  { name: "SoundCloud", detail: "Supported public links", mark: "s", className: "soundcloud" },
  { name: "Direct audio", detail: "Files you can access", mark: "♫", className: "direct" },
];

const qualities = ["64", "96", "128", "192", "256", "320"];

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState("320");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/playlist/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, qualityKbps: Number(quality) }),
      });
      const data = (await response.json()) as { message?: string };
      setMessage(data.message ?? "We couldn't process that link. Please try again.");
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="site-shell">
      <nav className="topbar">
        <a className="brand" href="/" aria-label="TuneFetch home">
          <span className="brand-icon" aria-hidden="true"><WaveIcon /></span>
          <span>tune<span className="brand-light">fetch</span></span>
        </a>
        <div className="nav-right"><span className="status-dot" /> No account needed <span className="nav-divider" /> <span className="privacy-label">Privacy-first by design</span></div>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-spark">✳</span> YOUR MUSIC, YOUR WAY</div>
        <h1>Your playlists.<br /><span>One simple download.</span></h1>
        <p className="hero-copy">Bring your playlist link. Choose your audio quality.<br className="desktop-break" /> Keep the tracks you’re allowed to download, all in one place.</p>

        <form className="import-card" onSubmit={handleSubmit}>
          <label className="input-label" htmlFor="playlist-url">PASTE A PLAYLIST OR AUDIO URL</label>
          <div className="url-field">
            <span className="link-icon" aria-hidden="true"><LinkIcon /></span>
            <input id="playlist-url" type="url" placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} required aria-describedby="url-help" />
            <button type="submit" className="import-button" disabled={busy}>{busy ? "Checking…" : "Continue"} <span aria-hidden="true">↗</span></button>
          </div>
          <p className="input-help" id="url-help"><LockIcon /> We validate links before processing. Never submit private or sensitive URLs.</p>
          <div className="quality-row">
            <div><span className="quality-heading">OUTPUT QUALITY</span><span className="quality-subtitle">MP3 bitrate</span></div>
            <div className="quality-options" role="group" aria-label="MP3 bitrate">
              {qualities.map((item) => <button type="button" key={item} className={quality === item ? "quality-chip selected" : "quality-chip"} aria-pressed={quality === item} onClick={() => setQuality(item)}>{item}</button>)}
              <span className="kbps-label">kbps</span>
            </div>
          </div>
          {message && <div className="notice" role="status">{message}</div>}
        </form>

        <div className="platform-heading"><span>BUILT FOR YOUR MUSIC WORKFLOW</span><span className="platform-line" /></div>
        <div className="platform-grid">
          {platforms.map((platform) => <div className="platform-card" key={platform.name}>
            <span className={"platform-mark " + platform.className}>{platform.mark}</span>
            <span className="platform-text"><strong>{platform.name}</strong><small>{platform.detail}</small></span>
            <span className="platform-arrow" aria-hidden="true">↗</span>
          </div>)}
        </div>
        <p className="platform-note">Platform support depends on each service’s API, terms, and download permissions.</p>
      </section>

      <section className="steps-section">
        <div className="section-kicker">A CLEANER WAY TO COLLECT AUDIO</div>
        <h2>From link to library.</h2>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><span className="step-icon"><LinkIcon /></span><h3>Drop your link</h3><p>Paste a supported playlist or an audio source you’re authorized to use.</p></article>
          <article className="step-card"><span className="step-number">02</span><span className="step-icon"><SlidersIcon /></span><h3>Set your quality</h3><p>Pick a bitrate that fits your needs and the source file’s capabilities.</p></article>
          <article className="step-card"><span className="step-number">03</span><span className="step-icon"><DownloadIcon /></span><h3>Save your tracks</h3><p>Download supported files individually or collect them in a ZIP archive.</p></article>
        </div>
      </section>

      <footer className="footer"><a className="brand footer-brand" href="/"><span className="brand-icon"><WaveIcon /></span><span>tune<span className="brand-light">fetch</span></span></a><span>Built for simpler audio workflows.</span><span className="footer-legal">Use only content you own or are authorized to download.</span></footer>
    </main>
  );
}

function WaveIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4M22 11v2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>; }
function LinkIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13.5a4.5 4.5 0 0 0 6.36 0l3-3A4.5 4.5 0 0 0 13 4.14l-1.72 1.72M14 10.5a4.5 4.5 0 0 0-6.36 0l-3 3A4.5 4.5 0 0 0 11 19.86l1.72-1.72" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function LockIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
function SlidersIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function DownloadIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
