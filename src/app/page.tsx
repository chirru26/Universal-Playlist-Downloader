"use client";

import { FormEvent, useEffect, useState } from "react";

type JobSummary = { id: string; sourceUrl: string; provider: string; qualityKbps: number; status: string; progressPercent: number; trackCount: number; createdAt?: string };\n\ntype PreviewTrack = {
  providerTrackId: string;
  title: string;
  artist: string;
  durationSeconds?: number;
  artworkUrl?: string;
};

const platforms = [
  { name: "YouTube", detail: "Playlist metadata", mark: "Y", className: "youtube" },
  { name: "Spotify", detail: "Playlist metadata", mark: "S", className: "spotify" },
  { name: "SoundCloud", detail: "Integration in progress", mark: "s", className: "soundcloud" },
  { name: "Direct audio", detail: "Authorized files", mark: "♫", className: "direct" },
];

const qualities = ["64", "96", "128", "192", "256", "320"];

function formatDuration(seconds?: number) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState("320");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [tracks, setTracks] = useState<PreviewTrack[]>([]);
  const [provider, setProvider] = useState("");\n  const [savingJob, setSavingJob] = useState(false);\n  const [jobMessage, setJobMessage] = useState("");\n  const [jobs, setJobs] = useState<JobSummary[]>([]);\n\n  async function refreshJobs() {\n    try {\n      const response = await fetch("/api/jobs", { cache: "no-store" });\n      if (!response.ok) return;\n      const data = (await response.json()) as { jobs?: JobSummary[] };\n      setJobs(data.jobs ?? []);\n    } catch {\n      // Job history is optional until the database is configured.\n    }\n  }\n\n  useEffect(() => { void refreshJobs(); }, []);\n\n  async function saveJob() {\n    setSavingJob(true);\n    setJobMessage("");\n    try {\n      const response = await fetch("/api/jobs", {\n        method: "POST",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ url, qualityKbps: Number(quality) }),\n      });\n      const data = (await response.json()) as { message?: string; job?: JobSummary };\n      setJobMessage(data.message ?? (response.ok ? "Job saved." : "Could not save this job."));\n      if (response.ok && data.job) setJobs((current) => [data.job!, ...current.filter((job) => job.id !== data.job!.id)].slice(0, 20));\n    } catch {\n      setJobMessage("Could not reach the server to save this job.");\n    } finally {\n      setSavingJob(false);\n    }\n  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setPlaylistTitle("");
    setTracks([]);
    setProvider("");
    setBusy(true);
    try {
      const response = await fetch("/api/playlist/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as {
        message?: string;
        title?: string;
        provider?: string;
        tracks?: PreviewTrack[];
        totalTracks?: number;
      };

      if (!response.ok) {
        setMessage(data.message ?? "Metadata is not available for this link yet.");
        return;
      }

      setPlaylistTitle(data.title ?? "Playlist preview");
      setProvider(data.provider ?? "");
      setTracks(data.tracks ?? []);
      setMessage(`Loaded ${(data.tracks ?? []).length} track(s) in this preview. Audio downloads are not enabled yet.`);
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
        <p className="hero-copy">Bring your playlist link. Preview available metadata.<br className="desktop-break" /> Download features will only support audio you’re authorized to save.</p>

        <form className="import-card" onSubmit={handleSubmit}>
          <label className="input-label" htmlFor="playlist-url">PASTE A PLAYLIST URL</label>
          <div className="url-field">
            <span className="link-icon" aria-hidden="true"><LinkIcon /></span>
            <input id="playlist-url" type="url" placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} required aria-describedby="url-help" />
            <button type="submit" className="import-button" disabled={busy}>{busy ? "Loading…" : "Preview"} <span aria-hidden="true">↗</span></button>
          </div>
          <p className="input-help" id="url-help"><LockIcon /> Links are validated before metadata requests. Never submit private or sensitive URLs.</p>
          <div className="quality-row">
            <div><span className="quality-heading">FUTURE OUTPUT QUALITY</span><span className="quality-subtitle">MP3 bitrate selection</span></div>
            <div className="quality-options" role="group" aria-label="MP3 bitrate">
              {qualities.map((item) => <button type="button" key={item} className={quality === item ? "quality-chip selected" : "quality-chip"} aria-pressed={quality === item} onClick={() => setQuality(item)}>{item}</button>)}
              <span className="kbps-label">kbps</span>
            </div>
          </div>
          {message && <div className="notice" role="status">{message}</div>}
        </form>

        {playlistTitle && <section className="playlist-preview" aria-label="Playlist preview">
          <div className="preview-header">
            <div><span className="preview-provider">{provider.toUpperCase()} · PREVIEW</span><h2>{playlistTitle}</h2></div>
            <span className="track-count">{tracks.length} tracks</span>
          </div>
          {tracks.length > 0 ? <div className="track-list">
            {tracks.map((track, index) => <article className="track-row" key={track.providerTrackId || index}>
              {track.artworkUrl ? <img className="track-artwork" src={track.artworkUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="track-placeholder" aria-hidden="true">♫</span>}
              <span className="track-details"><strong>{track.title}</strong><small>{track.artist || "Artist unavailable"}</small></span>
              <span className="track-duration">{formatDuration(track.durationSeconds)}</span>
            </article>)}
          </div> : <p className="preview-empty">No previewable tracks were returned for this link.</p>}
          <p className="preview-disclaimer">Metadata preview only. This app does not download audio yet.</p>\n          <button type="button" className="import-button job-save-button" onClick={saveJob} disabled={savingJob || !url}>\n            {savingJob ? "Saving…" : "Save to job history"}\n          </button>\n          {jobMessage && <p className="notice" role="status">{jobMessage}</p>}
        </section>}

        <div className="platform-heading"><span>BUILT FOR YOUR MUSIC WORKFLOW</span><span className="platform-line" /></div>
        <div className="platform-grid">
          {platforms.map((platform) => <div className="platform-card" key={platform.name}>
            <span className={"platform-mark " + platform.className}>{platform.mark}</span>
            <span className="platform-text"><strong>{platform.name}</strong><small>{platform.detail}</small></span>
            <span className="platform-arrow" aria-hidden="true">↗</span>
          </div>)}
        </div>
        <p className="platform-note">Metadata access does not grant permission to download a service’s audio.</p>\n\n        <section className="jobs-panel" aria-label="Your recent jobs">\n          <div className="preview-header"><div><span className="preview-provider">PRIVATE TO THIS BROWSER</span><h2>Recent jobs</h2></div><button type="button" className="text-button" onClick={() => void refreshJobs()}>Refresh</button></div>\n          {jobs.length ? <div className="job-list">{jobs.map((job) => <article className="job-row" key={job.id}><span className="job-status-dot" aria-hidden="true" /><span className="track-details"><strong>{job.provider} · {job.qualityKbps} kbps</strong><small>{job.sourceUrl}</small></span><span className="job-status">{job.status}</span></article>)}</div> : <p className="preview-empty">Saved jobs will appear here after you save one. Database setup is required.</p>}\n          <p className="preview-disclaimer">Jobs are saved for up to 7 days. Processing is not active yet; these are saved requests, not completed downloads.</p>\n        </section>
      </section>

      <section className="steps-section">
        <div className="section-kicker">A CLEANER WAY TO COLLECT AUDIO</div>
        <h2>From link to library.</h2>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><span className="step-icon"><LinkIcon /></span><h3>Drop your link</h3><p>Paste a supported playlist link and let the server check its metadata access.</p></article>
          <article className="step-card"><span className="step-number">02</span><span className="step-icon"><SlidersIcon /></span><h3>Set your quality</h3><p>Choose a future output bitrate; available quality depends on the authorized source.</p></article>
          <article className="step-card"><span className="step-number">03</span><span className="step-icon"><DownloadIcon /></span><h3>Save your tracks</h3><p>Individual and ZIP downloads are planned for supported, authorized audio sources.</p></article>
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
