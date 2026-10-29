import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

async function loadLocalEnvFile() {
  try {
    const content = await readFile(path.resolve(".env.local"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;

      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

// Environment variables supplied by the host take precedence over .env.local.
await loadLocalEnvFile();

const baseUrl = (process.env.WORKER_APP_URL || "").replace(/\/$/, "");
const secret = process.env.WORKER_API_SECRET || "";
const storageDir = process.env.AUTHORIZED_UPLOAD_DIR || "";
const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";
const pollMs = Math.max(1000, Number(process.env.WORKER_POLL_MS || 3000));

if (!baseUrl || !secret || !storageDir) {
  console.error("Set WORKER_APP_URL, WORKER_API_SECRET, and AUTHORIZED_UPLOAD_DIR.");
  process.exit(1);
}

const root = path.resolve(storageDir);
await mkdir(root, { recursive: true, mode: 0o700 });

function safeKey(value, extensionPattern) {
  return typeof value === "string" && extensionPattern.test(value);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with code ${code}: ${stderr.slice(-1500)}`));
    });
  });
}

async function requestWorker(action) {
  const response = await fetch(`${baseUrl}/api/internal/worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(action),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Worker API returned HTTP ${response.status}`);
  return data;
}

async function getDuration(inputPath) {
  try {
    const { stdout } = await runCommand(ffprobePath, [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath,
    ]);
    const seconds = Number(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

async function convert(job, leaseToken) {
  if (job.sourceType !== "authorized-upload" || !safeKey(job.uploadKey, /^[a-f0-9]{48}\.(mp3|wav|flac|ogg|m4a|aac|mp4|webm)$/)) {
    throw Object.assign(new Error("Unsupported or unsafe worker input."), { code: "INVALID_INPUT" });
  }
  if (![64, 96, 128, 192, 256, 320].includes(job.qualityKbps)) {
    throw Object.assign(new Error("Unsupported output bitrate."), { code: "INVALID_BITRATE" });
  }

  const inputPath = path.resolve(root, job.uploadKey);
  if (path.dirname(inputPath) !== root) throw Object.assign(new Error("Input path escaped private storage."), { code: "INVALID_INPUT" });
  const inputInfo = await stat(inputPath);
  const isVideoUpload = /\.(mp4|webm)$/.test(job.uploadKey);
  const maxInputBytes = isVideoUpload ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
  if (!inputInfo.isFile() || inputInfo.size > maxInputBytes) {
    throw Object.assign(new Error("Input is missing or exceeds the permitted size."), { code: "INVALID_INPUT" });
  }

  const outputKey = `${randomBytes(24).toString("hex")}.mp3`;
  const temporaryKey = `${randomBytes(24).toString("hex")}.tmp`;
  const temporaryPath = path.resolve(root, temporaryKey);
  const outputPath = path.resolve(root, outputKey);
  const duration = await getDuration(inputPath);
  let child;
  let leaseLost = false;
  let lastSentProgress = -1;
  let lastSentAt = 0;
  let progressBuffer = "";

  async function sendProgress(percent) {
    const safePercent = Math.max(0, Math.min(99, Math.floor(percent)));
    const now = Date.now();
    if (now - lastSentAt < 1500) return;
    lastSentProgress = safePercent;
    lastSentAt = now;
    try {
      await requestWorker({ action: "heartbeat", jobId: job.id, leaseToken, progressPercent: safePercent });
    } catch (error) {
      leaseLost = true;
      child?.kill("SIGTERM");
      console.error(`Lost lease for job ${job.id}: ${error.message}`);
    }
  }

  const heartbeat = setInterval(() => {
    void sendProgress(lastSentProgress < 0 ? 0 : lastSentProgress);
  }, 20000);

  try {
    child = spawn(ffmpegPath, [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
      "-vn", "-codec:a", "libmp3lame", "-b:a", `${job.qualityKbps}k`,
      "-map_metadata", "-1", "-progress", "pipe:1", "-nostats", "-f", "mp3", temporaryPath,
    ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
    child.stdout.on("data", (chunk) => {
      progressBuffer += chunk.toString();
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("out_time_ms=") || !duration) continue;
        const micros = Number(line.slice("out_time_ms=".length));
        if (Number.isFinite(micros)) void sendProgress((micros / 1_000_000 / duration) * 100);
      }
    });

    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (leaseLost) throw Object.assign(new Error("Job was cancelled or its lease was lost."), { code: "LEASE_LOST" });
    if (exitCode !== 0) throw Object.assign(new Error(`FFmpeg exited with code ${exitCode}: ${stderr.slice(-1500)}`), { code: "CONVERSION_FAILED" });

    const outputInfo = await stat(temporaryPath);
    if (!outputInfo.isFile() || outputInfo.size < 128) {
      throw Object.assign(new Error("FFmpeg did not produce a valid output file."), { code: "EMPTY_OUTPUT" });
    }
    await rename(temporaryPath, outputPath);

    try {
      await requestWorker({ action: "complete", jobId: job.id, leaseToken, outputKey });
    } catch (error) {
      // Keep the output if the response was lost: the server may already have committed completion.
      // A later storage cleanup task can remove orphaned outputs safely.
      throw Object.assign(new Error(`Could not publish completed output: ${error.message}`), { code: "COMPLETION_FAILED" });
    }

    await rm(inputPath, { force: true }).catch(() => undefined);
    console.log(`Completed job ${job.id} (${outputInfo.size} bytes).`);
  } finally {
    clearInterval(heartbeat);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function processJob(job, leaseToken) {
  console.log(`Claimed job ${job.id} attempt ${job.attempt}.`);
  try {
    await convert(job, leaseToken);
  } catch (error) {
    const code = /^[A-Z0-9_]+$/.test(error?.code || "") ? error.code : "WORKER_ERROR";
    console.error(`Job ${job.id} failed: ${error?.message || error}`);
    if (code !== "LEASE_LOST") {
      try {
        await requestWorker({ action: "fail", jobId: job.id, leaseToken, errorCode: code });
      } catch (reportError) {
        console.error(`Could not report job failure: ${reportError.message}`);
      }
    }
  }
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { stopping = true; console.log(`Received ${signal}; stopping after the current poll.`); });
}

console.log(`Authorized-upload worker started; polling ${baseUrl} every ${pollMs}ms.`);
while (!stopping) {
  try {
    const data = await requestWorker({ action: "claim" });
    if (data.job && data.leaseToken) {
      await processJob(data.job, data.leaseToken);
      continue;
    }
  } catch (error) {
    console.error(`Worker poll failed: ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
console.log("Worker stopped.");
