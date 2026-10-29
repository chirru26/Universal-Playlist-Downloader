"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type JobSummary = { id: string; sourceUrl: string; label?: string; downloadUrl?: string; provider: string; qualityKbps: number; status: string; progressPercent: number; trackCount: number; createdAt?: string };

type PreviewTrack = {
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
  const [provider, setProvider] = useState("");
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [totalTracks, setTotalTracks] = useState<number | null>(null);
  const [loadingMoreTracks, setLoadingMoreTracks] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [jobMessage, setJobMessage] = useState("");
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { jobs?: JobSummary[] };
      setJobs(data.jobs ?? []);
    } catch {
      // Job history is optional until the database is configured.
    }
  }, []);

  useEffect(() => { void refreshJobs(); }, [refreshJobs]);

  useEffect(() => {
    if (!jobs.some((job) => ["queued", "processing"].includes(job.status))) return;
    const timer = window.setInterval(() => { void refreshJobs(); }, 2500);
    return () => window.clearInterval(timer);
  }, [jobs, refreshJobs]);

  async function uploadAuthorizedAudio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!audioFile) {
      setUploadMessage("Choose an audio file first.");
      return;
    }
    setUploading(true);
    setUploadMessage("");
    try {
      const form = new FormData();
      form.set("file", audioFile);
      form.set("qualityKbps", quality);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const data = (await response.json()) as { message?: string };
      setUploadMessage(data.message ?? (response.ok ? "Upload saved." : "Upload failed."));
      if (response.ok) {
        setAudioFile(null);
        const input = document.getElementById("authorized-audio-file") as HTMLInputElement | null;
        if (input) input.value = "";
        await refreshJobs();
      }
    } catch {
      setUploadMessage("Could not reach the server to upload this file.");
    } finally {
      setUploading(false);
    }
  }

  async function cancelJob(jobId: string) {
    setCancellingJobId(jobId);
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      const data = (await response.json()) as { message?: string; job?: { id: string; status: string } };
      if (!response.ok) {
        setJobMessage(data.message ?? "Could not cancel this job.");
        return;
      }
      setJobs((current) => current.map((job) => job.id === jobId ? { ...job, status: data.job?.status ?? "cancelled" } : job));
      setJobMessage("Job cancelled.");
    } catch {
      setJobMessage("Could not reach the server to cancel this job.");
    } finally {
      setCancellingJobId(null);
    }
  }

  async function saveJob() {
    setSavingJob(true);
    setJobMessage("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, qualityKbps: Number(quality) }),
      });
      const data = (await response.json()) as { message?: string; job?: JobSummary };
      setJobMessage(data.message ?? (response.ok ? "Job saved." : "Could not save this job."));
      if (response.ok && data.job) setJobs((current) => [data.job!, ...current.filter((job) => job.id !== data.job!.id)].slice(0, 20));
    } catch {
      setJobMessage("Could not reach the server to save this job.");
    } finally {
      setSavingJob(false);
    }
  }

  async function loadMoreTracks() {
    if (!nextPageToken || loadingMoreTracks) return;
    setLoadingMoreTracks(true);
    try {
      const response = await fetch("/api/playlist/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, pageToken: nextPageToken }),
      });
      const data = (await response.json()) as {
        message?: string;
        tracks?: PreviewTrack[];
        nextPageToken?: string | null;
        totalTracks?: number;
      };
      if (!response.ok) {
        setMessage(data.message ?? "Could not load the next page of tracks.");
        return;
      }

      const additions = data.tracks ?? [];
      const seen = new Set(tracks.map((track) => track.providerTrackId));
      const uniqueAdditions = additions.filter((track) => {
        if (seen.has(track.providerTrackId)) return false;
        seen.add(track.providerTrackId);
        return true;
      });
      const combinedCount = tracks.length + uniqueAdditions.length;
      setTracks((current) => {
        const currentIds = new Set(current.map((track) => track.providerTrackId));
        return [...current, ...uniqueAdditions.filter((track) => !currentIds.has(track.providerTrackId))];
      });
      setNextPageToken(data.nextPageToken ?? null);
      if (typeof data.totalTracks === "number") setTotalTracks(data.totalTracks);
      setMessage(`Loaded ${combinedCount}${data.totalTracks ? ` of ${data.totalTracks}` : ""} track(s) in this preview. Provider links provide metadata only. Upload audio you own below for MP3 conversion.`);
    } catch {
      setMessage("Could not reach the server to load more tracks. Please try again.");
    } finally {
      setLoadingMoreTracks(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setPlaylistTitle("");
    setTracks([]);
    setProvider("");
    setNextPageToken(null);
    setTotalTracks(null);
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
        nextPageToken?: string | null;
      };

      if (!response.ok) {
        setMessage(data.message ?? "Metadata is not available for this link yet.");
        return;
      }

      setPlaylistTitle(data.title ?? "Playlist preview");
      setProvider(data.provider ?? "");
      setTracks(data.tracks ?? []);
      setNextPageToken(data.nextPageToken ?? null);
      setTotalTracks(typeof data.totalTracks === "number" ? data.totalTracks : (data.tracks ?? []).length);
      setMessage(`Loaded ${(data.tracks ?? []).length}${data.totalTracks ? ` of ${data.totalTracks}` : ""} track(s) in this preview. Audio downloads are not enabled yet.`);
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
        <p className="hero-copy">Bring your playlist link. Preview available metadata.<br className="desktop-break" /> Playlist links preview metadata. Upload audio you own below to convert it into a downloadable MP3.</p>

        <form className="import-card" onSubmit={handleSubmit}>
          <label className="input-label" htmlFor="playlist-url">PASTE A PLAYLIST URL</label>
          <div className="url-field">
            <span className="link-icon" aria-hidden="true"><LinkIcon /></span>
            <input id="playlist-url" type="url" placeholder="https://…" value={url} onChange={(event) => setUrl(event.target.value)} required aria-describedby="url-help" />
            <button type="submit" className="import-button" disabled={busy}>{busy ? "Loading…" : "Preview"} <span aria-hidden="true">↗</span></button>
          </div>
          <p className="input-help" id="url-help"><LockIcon /> Links are validated before metadata requests. Never submit private or sensitive URLs.</p>
          <div className="quality-row">
            <div><span className="quality-heading">MP3 OUTPUT QUALITY</span><span className="quality-subtitle">Bitrate for converted uploads</span></div>
            <div className="quality-options" role="group" aria-label="MP3 bitrate">
              {qualities.map((item) => <button type="button" key={item} className={quality === item ? "quality-chip selected" : "quality-chip"} aria-pressed={quality === item} onClick={() => setQuality(item)}>{item}</button>)}
              <span className="kbps-label">kbps</span>
            </div>
          </div>
          {message && <div className="notice" role="status">{message}</div>}
        </form>

        <section className="playlist-preview upload-panel" aria-label="Upload authorized audio">
          <div className="preview-header"><div><span className="preview-provider">FOR FILES YOU OWN OR MAY PROCESS</span><h2>Upload audio</h2></div><span className="track-count">25 MB max</span></div>
          <p className="preview-disclaimer">Upload audio you own or are authorized to process. The background worker converts it to MP3; completed files appear in Recent jobs with a Download MP3 link.</p>
          <form onSubmit={uploadAuthorizedAudio} className="upload-form">
            <label className="input-label" htmlFor="authorized-audio-file">AUDIO FILE (MP3, WAV, FLAC, OGG, M4A, AAC)</label>
            <input id="authorized-audio-file" type="file" accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,audio/*" onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)} />
            <button type="submit" className="import-button" disabled={uploading || !audioFile}>{uploading ? "Uploading…" : "Upload for MP3 conversion"}</button>
            {uploadMessage && <p className="notice" role="status">{uploadMessage}</p>}
          </form>
        </section>

        {playlistTitle && <section className="playlist-preview" aria-label="Playlist preview">
          <div className="preview-header">
            <div><span className="preview-provider">{provider.toUpperCase()} · PREVIEW</span><h2>{playlistTitle}</h2></div>
            <span className="track-count">{totalTracks !== null && totalTracks > tracks.length ? `${tracks.length} of ${totalTracks} tracks` : `${tracks.length} tracks`}</span>
          </div>
          {tracks.length > 0 ? <div className="track-list">
            {tracks.map((track, index) => <article className="track-row" key={track.providerTrackId || index}>
              {track.artworkUrl ? <img className="track-artwork" src={track.artworkUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="track-placeholder" aria-hidden="true">♫</span>}
              <span className="track-details"><strong>{track.title}</strong><small>{track.artist || "Artist unavailable"}</small></span>
              <span className="track-duration">{formatDuration(track.durationSeconds)}</span>
            </article>)}
          </div> : <p className="preview-empty">No previewable tracks were returned for this link.</p>}
          {nextPageToken && <button type="button" className="import-button job-save-button" onClick={() => void loadMoreTracks()} disabled={loadingMoreTracks}>{loadingMoreTracks ? "Loading more tracks…" : totalTracks !== null ? `Load more tracks (${Math.max(0, totalTracks - tracks.length)} remaining)` : "Load more tracks"}</button>}
          <p className="preview-disclaimer">Metadata preview only. Playlist URLs provide metadata only. Upload authorized audio above to create a downloadable MP3.</p>
          <button type="button" className="import-button job-save-button" onClick={saveJob} disabled={savingJob || !url}>
            {savingJob ? "Saving…" : "Save to job history"}
          </button>
          {jobMessage && <p className="notice" role="status">{jobMessage}</p>}
        </section>}

        <div className="platform-heading"><span>BUILT FOR YOUR MUSIC WORKFLOW</span><span className="platform-line" /></div>
        <div className="platform-grid">
          {platforms.map((platform) => <div className="platform-card" key={platform.name}>
            <span className={"platform-mark " + platform.className}>{platform.mark}</span>
            <span className="platform-text"><strong>{platform.name}</strong><small>{platform.detail}</small></span>
            <span className="platform-arrow" aria-hidden="true">↗</span>
          </div>)}
        </div>
        <p className="platform-note">Metadata access does not grant permission to download a service’s audio.</p>

        <section className="jobs-panel" aria-label="Your recent jobs">
          <div className="preview-header"><div><span className="preview-provider">PRIVATE TO THIS BROWSER</span><h2>Recent jobs</h2></div><button type="button" className="text-button" onClick={() => void refreshJobs()}>Refresh</button></div>
          {jobs.length ? <div className="job-list">{jobs.map((job) => <article className="job-row" key={job.id}><span className="job-status-dot" aria-hidden="true" /><span className="track-details"><strong>{job.provider === "direct" ? "Uploaded audio" : job.provider} · {job.qualityKbps} kbps</strong><small>{job.label || job.sourceUrl}</small>{["queued", "processing"].includes(job.status) && <span className="job-progress" role="progressbar" aria-label="Conversion progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progressPercent}><span style={{ width: `${Math.max(0, Math.min(100, job.progressPercent))}%` }} /></span>}</span><span className="job-status">{job.status}{job.status === "processing" ? ` · ${job.progressPercent}%` : ""}</span>{job.downloadUrl && <a className="text-button" href={job.downloadUrl}>Download MP3</a>}{["queued", "processing"].includes(job.status) && <button type="button" className="text-button" onClick={() => void cancelJob(job.id)} disabled={cancellingJobId !== null}>{cancellingJobId === job.id ? "Cancelling…" : "Cancel"}</button>}</article>)}</div> : <p className="preview-empty">Saved jobs will appear here after you save one. Database setup is required.</p>}
          <p className="preview-disclaimer">Jobs are saved for up to 7 days. Authorized uploads show live conversion progress; completed MP3s can be downloaded from this browser.</p>
        </section>
      </section>

      <section className="steps-section">
        <div className="section-kicker">PREVIEW PLAYLISTS. CONVERT AUTHORIZED FILES.</div>
        <h2>From preview to MP3.</h2>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><span className="step-icon"><LinkIcon /></span><h3>Preview a playlist</h3><p>Paste a supported playlist link to view its title and track metadata.</p></article>
          <article className="step-card"><span className="step-number">02</span><span className="step-icon"><SlidersIcon /></span><h3>Choose your bitrate</h3><p>Select an MP3 bitrate when uploading audio you own or are authorized to convert.</p></article>
          <article className="step-card"><span className="step-number">03</span><span className="step-icon"><DownloadIcon /></span><h3>Download your MP3</h3><p>When the background worker completes conversion, download the MP3 from Recent jobs.</p></article>
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
