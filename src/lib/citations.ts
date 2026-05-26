// Helpers for rendering "source-of-truth" timestamped citations.
// The AI is instructed to embed markers like [[t=123]] (seconds) inside the
// generated Markdown. At render time we inject clickable links that open the
// YouTube source at the cited moment.

export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns: RegExp[] = [
    /youtu\.be\/([\w-]{11})/,
    /[?&]v=([\w-]{11})/,
    /embed\/([\w-]{11})/,
    /shorts\/([\w-]{11})/,
    /live\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const CITATION_RE = /\[\[t=(\d+)\]\]/g;

/**
 * Turns `[[t=123]]` markers in the markdown into inline anchor tags that
 * deep-link into the YouTube video. rehype-raw renders them as real <a>.
 */
export function injectCitationLinks(
  markdown: string,
  videoId: string | null,
): string {
  if (!markdown) return markdown;
  return markdown.replace(CITATION_RE, (_full, raw: string) => {
    const sec = parseInt(raw, 10);
    if (!Number.isFinite(sec)) return "";
    const label = formatTimestamp(sec);
    if (!videoId) {
      return ` <sup class="yt-cite yt-cite--missing" title="Source moment ${label}">[${label}]</sup>`;
    }
    const href = `https://www.youtube.com/watch?v=${videoId}&t=${sec}s`;
    return ` <a href="${href}" target="_blank" rel="noopener noreferrer" class="yt-cite" data-t="${sec}" title="Watch source at ${label}">▶ ${label}</a>`;
  });
}

/** Strip citation markers entirely (used for copy/export so the markdown
 *  stays clean when pasted into other tools). */
export function stripCitationMarkers(markdown: string): string {
  return markdown.replace(CITATION_RE, "").replace(/[ \t]{2,}/g, " ");
}
