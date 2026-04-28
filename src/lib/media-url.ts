const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function getYouTubeEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);

    if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }

    const id = getYouTubeVideoId(url);

    if (!id || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
      return null;
    }

    return `https://www.youtube.com/embed/${encodeURIComponent(
      id
    )}?playsinline=1&rel=0`;
  } catch {
    return null;
  }
}

function getYouTubeVideoId(url: URL): string | null {
  if (url.hostname.toLowerCase() === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0] ?? null;
  }

  const watchId = url.searchParams.get("v");

  if (watchId) {
    return watchId;
  }

  const [type, id] = url.pathname.split("/").filter(Boolean);
  return type === "embed" || type === "shorts" ? (id ?? null) : null;
}
