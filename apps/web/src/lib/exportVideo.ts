import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import workerURL from "@ffmpeg/ffmpeg/worker?url";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { ContentType } from "@speakez/shared";

type ExportOptions = {
  recordingBlob?: Blob | null;
  videoUrl?: string | null;
  prompt: string;
  contentType: ContentType;
  durationSeconds: number;
};

type OverlayOptions = Pick<ExportOptions, "prompt" | "contentType" | "durationSeconds">;
type ExportFormat = "mp4" | "webm";
type AudioCapture = {
  stream: MediaStream;
  resume: () => Promise<void>;
  close: () => Promise<void>;
};
type CapturableVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export type ExportResult = {
  blob: Blob;
  extension: "mp4" | "webm";
  mimeType: "video/mp4" | "video/webm";
  notice?: string;
};

class FfmpegExportError extends Error {
  logs: string[];

  constructor(message: string, logs: string[]) {
    super(message);
    this.name = "FfmpegExportError";
    this.logs = logs;
  }
}

let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

export async function exportComposedMp4({ recordingBlob, videoUrl, prompt, contentType, durationSeconds }: ExportOptions): Promise<ExportResult> {
  const input = await recordingBlobOrFetch({ recordingBlob, videoUrl });
  const overlay = await renderOverlayPng({ prompt, contentType, durationSeconds });

  let ffmpeg: FFmpeg;
  try {
    ffmpeg = await loadFfmpeg();
  } catch (error) {
    window.console.warn("[SpeakEZ] FFmpeg could not load; using browser WebM fallback.", error);
    const composedWebm = await withTimeout(
      composeWatermarkedWebm(input, { prompt, contentType, durationSeconds }),
      Math.max(30_000, durationSeconds * 1_500 + 5_000),
      "Watermarked video export timed out."
    );
    return {
      blob: composedWebm,
      extension: "webm",
      mimeType: "video/webm",
      notice: `MP4 export was not available (${errorMessage(error)}), so a watermarked WebM video was downloaded instead.`
    };
  }

  try {
    const mp4 = await transcodeWithOverlay(ffmpeg, input, overlay, "mp4", durationSeconds);
    return {
      blob: mp4,
      extension: "mp4",
      mimeType: "video/mp4"
    };
  } catch (mp4Error) {
    logFfmpegFailure("MP4 export failed", mp4Error);
    try {
      const fallbackFfmpeg = await reloadFfmpeg(ffmpeg);
      const webm = await transcodeWithOverlay(fallbackFfmpeg, input, overlay, "webm", durationSeconds);
      return {
        blob: webm,
        extension: "webm",
        mimeType: "video/webm",
        notice: `MP4 export was not available (${errorMessage(mp4Error)}), so a watermarked WebM video was downloaded instead.`
      };
    } catch (webmError) {
      logFfmpegFailure("Watermarked WebM fallback failed", webmError);
      throw new Error(`MP4 export failed (${errorMessage(mp4Error)}) and WebM fallback failed (${errorMessage(webmError)}).`);
    }
  }
}

async function recordingBlobOrFetch({ recordingBlob, videoUrl }: Pick<ExportOptions, "recordingBlob" | "videoUrl">) {
  if (recordingBlob) return recordingBlob;
  if (!videoUrl) throw new Error("Recording was not available for export.");
  return fetchVideoBlob(videoUrl);
}

async function transcodeWithOverlay(ffmpeg: FFmpeg, input: Blob, overlay: Blob, format: ExportFormat, durationSeconds: number) {
  const id = uniqueExportId();
  const inputName = `${id}-input.webm`;
  const overlayName = `${id}-overlay.png`;
  const outputName = `${id}-export.${format}`;

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await input.arrayBuffer()));
    await ffmpeg.writeFile(overlayName, new Uint8Array(await overlay.arrayBuffer()));
    const args = format === "mp4" ? mp4Args(inputName, overlayName, outputName, durationSeconds) : webmArgs(inputName, overlayName, outputName, durationSeconds);
    const timeoutMs =
      format === "mp4" ? Math.max(120_000, durationSeconds * 3_000 + 30_000) : Math.max(90_000, durationSeconds * 2_500 + 20_000);
    await runFfmpegExec(ffmpeg, args, timeoutMs, format === "mp4" ? "MP4 export" : "Watermarked WebM fallback");
    const data = await ffmpeg.readFile(outputName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data as Uint8Array);
    return new Blob([bytes], { type: format === "mp4" ? "video/mp4" : "video/webm" });
  } finally {
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(overlayName), ffmpeg.deleteFile(outputName)]);
  }
}

function mp4Args(inputName: string, overlayName: string, outputName: string, durationSeconds: number) {
  return [
    "-fflags",
    "+genpts",
    "-i",
    inputName,
    "-loop",
    "1",
    "-i",
    overlayName,
    "-filter_complex",
    "[0:v]fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x15131a,setsar=1[base];[base][1:v]overlay=0:0:format=auto,format=yuv420p[v]",
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-t",
    exportDuration(durationSeconds),
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputName
  ];
}

function webmArgs(inputName: string, overlayName: string, outputName: string, durationSeconds: number) {
  return [
    "-fflags",
    "+genpts",
    "-i",
    inputName,
    "-loop",
    "1",
    "-i",
    overlayName,
    "-filter_complex",
    "[0:v]fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x15131a,setsar=1[base];[base][1:v]overlay=0:0:format=auto,format=yuv420p[v]",
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-t",
    exportDuration(durationSeconds),
    "-shortest",
    "-c:v",
    "libvpx",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-b:v",
    "2400k",
    "-r",
    "30",
    "-c:a",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    outputName
  ];
}

async function runFfmpegExec(ffmpeg: FFmpeg, args: string[], timeoutMs: number, label: string) {
  const logs: string[] = [];
  const onLog = ({ type, message }: { type: string; message: string }) => {
    logs.push(`[${type}] ${message}`);
  };

  ffmpeg.on("log", onLog);
  try {
    const code = await ffmpeg.exec(args, timeoutMs);
    if (code !== 0) {
      throw new FfmpegExportError(`${label} failed: ${summarizeFfmpegLogs(logs) || `FFmpeg exited with code ${code}.`}`, logs);
    }
  } catch (error) {
    if (error instanceof FfmpegExportError) throw error;
    throw new FfmpegExportError(`${label} failed: ${summarizeFfmpegLogs(logs) || errorMessage(error)}`, logs);
  } finally {
    ffmpeg.off("log", onLog);
  }
}

async function loadFfmpeg() {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = createFfmpeg().catch((error) => {
      ffmpegLoadPromise = null;
      throw error;
    });
  }
  return ffmpegLoadPromise;
}

async function reloadFfmpeg(ffmpeg: FFmpeg) {
  ffmpeg.terminate();
  ffmpegLoadPromise = null;
  return loadFfmpeg();
}

async function createFfmpeg() {
  const { FFmpeg: FFmpegClass } = await import("@ffmpeg/ffmpeg");
  const ffmpeg = new FFmpegClass();
  await withTimeout(
    ffmpeg.load({
      classWorkerURL: workerURL,
      coreURL,
      wasmURL
    }),
    120_000,
    "MP4 encoder did not load."
  );
  return ffmpeg;
}

async function fetchVideoBlob(videoUrl: string) {
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Could not read recording: ${response.status}`);
  return response.blob();
}

async function composeWatermarkedWebm(input: Blob, overlayOptions: OverlayOptions) {
  if (!window.MediaRecorder) throw new Error("Watermarked video export is not supported in this browser.");

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is not supported in this browser.");
  if (!canvas.captureStream) throw new Error("Canvas video export is not supported in this browser.");

  const video = document.createElement("video");
  const sourceUrl = URL.createObjectURL(input);
  const canvasStream = canvas.captureStream(30);
  const chunks: BlobPart[] = [];
  let audioCapture: AudioCapture | null = null;
  let outputStream: MediaStream | null = null;
  let frameId = 0;
  let stopTimer = 0;
  let stopped = false;

  try {
    video.src = sourceUrl;
    video.preload = "auto";
    video.playsInline = true;
    await waitForVideoMetadata(video);

    audioCapture = createAudioCapture(video);
    video.muted = false;
    outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...(audioCapture?.stream.getAudioTracks() ?? [])]);

    const mimeType = preferredWebmMimeType();
    const recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 128_000
    });
    const recording = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("Watermarked video export failed."));
      recorder.onstop = () => {
        if (!chunks.length) {
          reject(new Error("Watermarked video export did not produce any video data."));
          return;
        }
        resolve(new Blob(chunks, { type: mimeType }));
      };
    });
    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(stopTimer);
      if (recorder.state !== "inactive") recorder.stop();
    };
    const drawFrame = () => {
      drawComposedFrame(context, canvas, video, overlayOptions);
      if (!stopped) frameId = window.requestAnimationFrame(drawFrame);
    };

    video.addEventListener("ended", stop, { once: true });
    stopTimer = window.setTimeout(stop, Math.max(1_000, Math.ceil(overlayOptions.durationSeconds * 1_000) + 750));
    recorder.start(250);
    drawFrame();

    try {
      await playVideoForExport(video, audioCapture);
    } catch {
      stop();
      throw new Error("Could not play the recording for export.");
    }

    return await recording;
  } finally {
    stopped = true;
    window.cancelAnimationFrame(frameId);
    window.clearTimeout(stopTimer);
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
    outputStream?.getTracks().forEach((track) => track.stop());
    canvasStream.getTracks().forEach((track) => track.stop());
    await audioCapture?.close();
  }
}

function createAudioCapture(video: HTMLVideoElement): AudioCapture | null {
  const capturedStream = captureMediaElementStream(video);
  const capturedAudioTracks = capturedStream?.getAudioTracks() ?? [];
  if (capturedStream && capturedAudioTracks.length > 0) {
    return {
      stream: new MediaStream(capturedAudioTracks),
      resume: async () => {},
      close: async () => capturedStream.getTracks().forEach((track) => track.stop())
    };
  }

  return createWebAudioCapture(video);
}

function captureMediaElementStream(video: HTMLVideoElement) {
  const capturableVideo = video as CapturableVideoElement;
  const captureStream = capturableVideo.captureStream || capturableVideo.mozCaptureStream;
  if (!captureStream) return null;
  try {
    return captureStream.call(video);
  } catch {
    return null;
  }
}

function createWebAudioCapture(video: HTMLVideoElement): AudioCapture | null {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    return {
      stream: destination.stream,
      resume: () => audioContext.resume(),
      close: async () => {
        source.disconnect();
        destination.disconnect();
        await audioContext.close();
      }
    };
  } catch {
    return null;
  }
}

async function playVideoForExport(video: HTMLVideoElement, audioCapture: AudioCapture | null) {
  await audioCapture?.resume();
  try {
    await video.play();
  } catch (error) {
    if (audioCapture) {
      video.muted = true;
      await video.play();
      return;
    }
    throw error;
  }
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1 && video.videoWidth && video.videoHeight) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("error", onError);
    };
    const onLoadedMetadata = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not load recording for export."));
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.load();
  });
}

function preferredWebmMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const supported = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!supported) throw new Error("Watermarked WebM export is not supported in this browser.");
  return supported;
}

async function renderOverlayPng(overlayOptions: OverlayOptions) {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is not supported in this browser.");

  context.clearRect(0, 0, canvas.width, canvas.height);
  renderOverlay(context, overlayOptions);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not render export overlay.");
  return blob;
}

function drawComposedFrame(context: CanvasRenderingContext2D, canvas: { width: number; height: number }, video: HTMLVideoElement, overlayOptions: OverlayOptions) {
  context.fillStyle = "#15131a";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const videoWidth = video.videoWidth || canvas.width;
  const videoHeight = video.videoHeight || canvas.height;
  const scale = Math.min(canvas.width / videoWidth, canvas.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  context.drawImage(video, x, y, width, height);

  renderOverlay(context, overlayOptions);
}

function renderOverlay(context: CanvasRenderingContext2D, { prompt, contentType, durationSeconds }: OverlayOptions) {
  const safePrompt = prompt.trim() || "Freestyle practice";
  const promptLabel = contentType === "word" ? "Word" : "Prompt";

  context.fillStyle = "rgba(21, 19, 26, 0.82)";
  context.fillRect(0, 0, 1280, 110);
  context.fillStyle = "#fffaf0";
  context.font = "700 30px Inter, Arial, sans-serif";
  wrapText(context, safePrompt, 34, 42, 930, 34, 2);

  context.fillStyle = "#ffb000";
  context.font = "900 34px Inter, Arial, sans-serif";
  context.textAlign = "right";
  context.fillText(formatExportTime(durationSeconds), 1246, 64);
  context.textAlign = "left";

  const badgeWidth = 370;
  const badgeHeight = 74;
  const badgeX = 876;
  const badgeY = 612;
  context.fillStyle = "rgba(21, 19, 26, 0.78)";
  roundRect(context, badgeX, badgeY, badgeWidth, badgeHeight, 8);
  context.fill();
  context.fillStyle = "#42d392";
  context.font = "900 26px Inter, Arial, sans-serif";
  context.fillText("SpeakEZ", badgeX + 18, badgeY + 30);
  context.fillStyle = "#fffaf0";
  context.font = "800 16px Inter, Arial, sans-serif";
  drawSingleLineText(context, `${promptLabel}: ${safePrompt}`, badgeX + 18, badgeY + 56, badgeWidth - 36);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const testLine = `${line}${word} `;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      const isLastLine = lines + 1 >= maxLines;
      ctx.fillText(isLastLine ? truncateText(ctx, line.trim(), maxWidth) : line.trim(), x, y);
      lines += 1;
      if (lines >= maxLines) return;
      line = `${word} `;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line && lines < maxLines) ctx.fillText(truncateText(ctx, line.trim(), maxWidth), x, y);
}

function drawSingleLineText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  ctx.fillText(truncateText(ctx, text, maxWidth), x, y);
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "...";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, middle)}${ellipsis}`).width <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return `${text.slice(0, low).trimEnd()}${ellipsis}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function exportDuration(totalSeconds: number) {
  return String(Math.max(1, Math.ceil(totalSeconds)));
}

function formatExportTime(totalSeconds: number) {
  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function uniqueExportId() {
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `speakez-${id.replace(/[^a-z0-9-]/gi, "")}`;
}

function logFfmpegFailure(label: string, error: unknown) {
  window.console.warn(`[SpeakEZ] ${label}`, {
    message: errorMessage(error),
    logs: error instanceof FfmpegExportError ? error.logs.slice(-20) : []
  });
}

function summarizeFfmpegLogs(logs: string[]) {
  const interesting = logs
    .map((line) => line.replace(/^\[(stdout|stderr)\]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("frame="))
    .filter((line) => !line.startsWith("size="))
    .filter((line) => !line.startsWith("video:"))
    .filter((line) => !line.includes("Press [q] to stop"));
  return truncateMessage(interesting.slice(-3).join(" "));
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return truncateMessage(error.message);
  return "encoder failed";
}

function truncateMessage(message: string) {
  return message.length > 220 ? `${message.slice(0, 217)}...` : message;
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}
