/** Normalize TTS bytes so browsers can play them. OpenRouter defaults to raw PCM. */

function pcmToWav(
  pcm: Uint8Array,
  rate: number,
  channels: number,
  bits: number,
): Uint8Array {
  const block = (channels * bits) / 8;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  header.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 36 + pcm.byteLength, true);
  header.set(new TextEncoder().encode("WAVE"), 8);
  header.set(new TextEncoder().encode("fmt "), 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * block, true);
  view.setUint16(32, block, true);
  view.setUint16(34, bits, true);
  header.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(header);
  out.set(pcm, 44);
  return out;
}

function numParam(mime: string, key: string, fallback: number) {
  const m = new RegExp(`${key}=(\\d+)`, "i").exec(mime);
  const n = m ? Number(m[1]) : fallback;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function looksMp3(buf: Uint8Array) {
  return (
    (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
    (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  );
}

function looksWav(buf: Uint8Array) {
  return (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46
  );
}

function looksOgg(buf: Uint8Array) {
  return (
    buf[0] === 0x4f &&
    buf[1] === 0x67 &&
    buf[2] === 0x67 &&
    buf[3] === 0x53
  );
}

export function ensurePlayableAudio(
  buf: Uint8Array,
  mime = "",
): { data: Uint8Array; mime: string } {
  if (buf.byteLength < 16) {
    throw new Error("TTS returned empty audio");
  }
  if (looksMp3(buf)) return { data: buf, mime: "audio/mpeg" };
  if (looksWav(buf)) return { data: buf, mime: "audio/wav" };
  if (looksOgg(buf)) return { data: buf, mime: "audio/ogg" };

  const raw = mime.toLowerCase();
  if (
    raw.includes("pcm") ||
    raw.includes("l16") ||
    raw.includes("raw") ||
    raw.includes("octet-stream")
  ) {
    return {
      data: pcmToWav(
        buf,
        numParam(mime, "rate", 44100),
        numParam(mime, "channels", 1),
        numParam(mime, "bits", 16),
      ),
      mime: "audio/wav",
    };
  }
  if (raw.includes("mpeg") || raw.includes("mp3"))
    return { data: buf, mime: "audio/mpeg" };
  if (raw.includes("wav")) return { data: buf, mime: "audio/wav" };
  if (raw.includes("ogg")) return { data: buf, mime: "audio/ogg" };

  // Unknown binary from a speech endpoint — wrap as 44.1kHz mono WAV.
  return {
    data: pcmToWav(buf, 44100, 1, 16),
    mime: "audio/wav",
  };
}
