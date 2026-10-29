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

type JamendoTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  artworkUrl?: string;
  trackUrl?: string;
  licenseUrl?: string;
  downloadAllowed: boolean;
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
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [jamendoQuery, setJamendoQuery] = useState("");
  const [jamendoTracks, setJamendoTracks] = useState<JamendoTrack[]>([]);
  const [jamendoBusy, setJamendoBusy] = useState(false);
  const [jamendoMessage, setJamendoMessage] = useState("");
  const [jamendoOffset, setJamendoOffset] = useState(0);
  const [jamendoHasMore, setJamendoHasMore] = useState(false);

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

  async function uploadAuthorizedMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (audioFiles.length === 0) {
      setUploadMessage("Choose at least one audio or video file first.");
      return;
    }
    if (audioFiles.length > 5) {
      setUploadMessage("Select at most 5 files at a time. The app allows up to 5 active jobs per browser.");
      return;
    }

    setUploading(true);
    setUploadMessage("");
    let queuedCount = 0;
    const failures: string[] = [];

    try {
      for (const file of audioFiles) {
        const form = new FormData();
        form.set("file", file);
        form.set("qualityKbps", quality);

        let response: Response;
        let data: { message?: string };
        try {
          response = await fetch("/api/uploads", { method: "POST", body: form });
          data = (await response.json()) as { message?: string };
        } catch {
          failures.push(`${file.name}: could not reach the upload server.`);
          break;
        }

        if (!response.ok) {
          failures.push(`${file.name}: ${data.message ?? "upload failed"}`);
          if (response.status === 429) break;
          continue;
        }

        queuedCount += 1;
        setUploadMessage(`Uploading and queueing: ${queuedCount} of ${audioFiles.length} file(s)…`);
        await refreshJobs();
      }

      if (queuedCount === audioFiles.length) {
        setUploadMessage(`Queued all ${queuedCount} file(s). Completed MP3s will appear in Recent jobs when the worker finishes.`);
      } else {
        setUploadMessage(`Queued ${queuedCount} of ${audioFiles.length} file(s). ${failures.join(" ")} Reselect only files that were not queued to retry.`);
      }

      if (queuedCount > 0) await refreshJobs();
      setAudioFiles([]);
      const input = document.getElementById("authorized-audio-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } finally {
      setUploading(false);
    }
  }

  async function searchJamendo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = jamendoQuery.trim();
    if (query.length < 2) {
      setJamendoMessage("Enter at least two characters to search.");
      return;
    }

    setJamendoBusy(true);
    setJamendoMessage("");
    setJamendoTracks([]);
    setJamendoOffset(0);
    setJamendoHasMore(false);
    try {
      const response = await fetch(`/api/jamendo/search?q=${encodeURIComponent(query)}&offset=0`, { cache: "no-store" });
      const data = (await response.json()) as { message?: string; tracks?: JamendoTrack[]; hasMore?: boolean; offset?: number; nextOffset?: number };
      if (!response.ok) {
        setJamendoMessage(data.message ?? "Jamendo search failed.");
        return;
      }
      const found = data.tracks ?? [];
      setJamendoTracks(found);
      setJamendoOffset(data.nextOffset ?? ((data.offset ?? 0) + found.length));
      setJamendoHasMore(Boolean(data.hasMore));
      setJamendoMessage(found.length ? `Found ${found.length} track(s). Download is available only when the artist permits it.` : "No tracks found. Try another song, artist, or genre.");
    } catch {
      setJamendoMessage("Could not reach Jamendo search. Please try again.");
    } finally {
      setJamendoBusy(false);
    }
  }

  async function loadMoreJamendo() {
    if (jamendoBusy || !jamendoHasMore || !jamendoQuery.trim()) return;
    setJamendoBusy(true);
    setJamendoMessage("");
    try {
      const response = await fetch(`/api/jamendo/search?q=${encodeURIComponent(jamendoQuery.trim())}&offset=${jamendoOffset}`, { cache: "no-store" });
      const data = (await response.json()) as { message?: string; tracks?: JamendoTrack[]; hasMore?: boolean; offset?: number; nextOffset?: number };
      if (!response.ok) {
        setJamendoMessage(data.message ?? "Could not load more tracks.");
        return;
      }
      const more = data.tracks ?? [];
      setJamendoTracks((current) => {
        const ids = new Set(current.map((track) => track.id));
        const uniqueMore = more.filter((track) => {
          if (ids.has(track.id)) return false;
          ids.add(track.id);
          return true;
        });
        return [...current, ...uniqueMore];
      });
      setJamendoOffset(data.nextOffset ?? ((data.offset ?? jamendoOffset) + more.length));
      setJamendoHasMore(Boolean(data.hasMore));
      setJamendoMessage(more.length ? `Loaded ${more.length} more track(s).` : "No additional tracks were returned.");
    } catch {
      setJamendoMessage("Could not reach Jamendo. Please try again.");
    } finally {
      setJamendoBusy(false);
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
      setMessage(`Loaded ${(data.tracks ?? []).length}${data.totalTracks ? ` of ${data.totalTracks}` : ""} track(s) in this preview. Provider links show metadata only. Upload audio you own below for MP3 conversion.`);
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

        <section className="playlist-preview jamendo-panel" aria-label="Jamendo downloadable music">
          <div className="preview-header">
            <div><span className="preview-provider">ARTIST-PERMITTED DOWNLOADS</span><h2>Discover downloadable music</h2></div>
            <span className="track-count">Jamendo</span>
          </div>
          <p className="preview-disclaimer">Search independent music. The Download MP3 button appears only when Jamendo says the artist allows downloads; the permission is checked again when you click it.</p>
          <form className="jamendo-search" onSubmit={searchJamendo}>
            <input aria-label="Search Jamendo tracks" type="search" minLength={2} maxLength={120} placeholder="Search a song, artist, or genre" value={jamendoQuery} onChange={(event) => setJamendoQuery(event.target.value)} required />
            <button type="submit" className="import-button" disabled={jamendoBusy}>{jamendoBusy ? "Searching…" : "Search songs"}</button>
          </form>
          {jamendoMessage && <p className="notice" role="status">{jamendoMessage}</p>}
          {jamendoTracks.length > 0 && <div className="track-list jamendo-results">
            {jamendoTracks.map((track) => <article className="track-row jamendo-row" key={track.id}>
              {track.artworkUrl ? <img className="track-artwork" src={track.artworkUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="track-placeholder" aria-hidden="true">♫</span>}
              <span className="track-details">
                <strong>{track.title}</strong>
                <small>{track.artist}{track.album ? ` · ${track.album}` : ""}</small>
                <small>{formatDuration(track.durationSeconds)} · {track.downloadAllowed ? "Artist permits downloads" : "Download not permitted by artist"}</small>
                {track.trackUrl && <a className="track-source-link" href={track.trackUrl} target="_blank" rel="noopener noreferrer">View on Jamendo ↗</a>}
                {track.licenseUrl && <a className="track-source-link" href={track.licenseUrl} target="_blank" rel="noopener noreferrer">View license ↗</a>}
              </span>
              {track.downloadAllowed
                ? <a className="text-button jamendo-download" href={`/api/jamendo/tracks/${encodeURIComponent(track.id)}/download`}>Download MP3</a>
                : <span className="job-status jamendo-unavailable">Not downloadable</span>}
            </article>)}
          </div>}
          {jamendoHasMore && <button type="button" className="import-button job-save-button" onClick={() => void loadMoreJamendo()} disabled={jamendoBusy}>{jamendoBusy ? "Loading…" : "Load more songs"}</button>}
          <p className="preview-disclaimer">Powered by Jamendo. Respect the track license and attribution requirements shown by Jamendo.</p>
        </section>

        {provider === "youtube" && <section className="playlist-preview youtube-owned-panel" aria-label="Convert your own YouTube video">
          <div className="preview-header"><div><span className="preview-provider">YOUR OWN YOUTUBE VIDEOS</span><h2>Convert an upload you own</h2></div></div>
          <p className="preview-disclaimer">YouTube does not provide an API for downloading arbitrary playlist audio. If a video is yours, YouTube lets you download eligible uploads from Studio. Download the MP4 there, then upload it below to convert its audio to MP3.</p>
          <a className="text-button" href="https://studio.youtube.com/" target="_blank" rel="noopener noreferrer">Open YouTube Studio ↗</a> <a className="track-source-link" href="https://support.google.com/youtube/answer/56100?hl=en" target="_blank" rel="noopener noreferrer">Official download instructions</a>
          <p className="preview-empty">In Studio: Content → select your video → menu → Download. This only works for eligible videos on your own channel. Then upload the MP4 in the section below. To export all videos you uploaded, use <a className="track-source-link" href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout ↗</a>.</p>
        </section>}

        <section className="playlist-preview upload-panel" aria-label="Upload authorized media">
          <div className="preview-header"><div><span className="preview-provider">FOR FILES YOU OWN OR MAY PROCESS</span><h2>Upload for MP3 conversion</h2></div><span className="track-count">25 MB audio · 100 MB video</span></div>
          <p className="preview-disclaimer">Upload up to 5 files at a time that you own or are authorized to process. You can select multiple eligible MP4/WebM videos downloaded from your own YouTube Studio; the app queues them one at a time for MP3 conversion.</p>
          <form onSubmit={uploadAuthorizedMedia} className="upload-form">
            <label className="input-label" htmlFor="authorized-audio-file">AUDIO OR VIDEO FILES (MP3, WAV, FLAC, OGG, M4A, AAC, MP4, WEBM)</label>
            <input id="authorized-audio-file" type="file" accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,.mp4,.webm,audio/*,video/mp4,video/webm" multiple disabled={uploading} onChange={(event) => setAudioFiles(Array.from(event.target.files ?? []))} />
            <button type="submit" className="import-button" disabled={uploading || audioFiles.length === 0}>{uploading ? "Uploading…" : audioFiles.length ? `Upload ${audioFiles.length} file${audioFiles.length === 1 ? "" : "s"} for MP3 conversion` : "Choose files to convert"}</button>
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
              <span className="track-details"><strong>{track.title}</strong><small>{track.artist || "Artist unavailable"}</small><a className="track-source-link" href={provider === "youtube" ? `https://www.youtube.com/watch?v=${encodeURIComponent(track.providerTrackId)}` : provider === "spotify" ? `https://open.spotify.com/track/${encodeURIComponent(track.providerTrackId)}` : url} target="_blank" rel="noopener noreferrer">{provider === "youtube" ? "Open on YouTube" : provider === "spotify" ? "Open on Spotify" : "Open source"} ↗</a></span>
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
