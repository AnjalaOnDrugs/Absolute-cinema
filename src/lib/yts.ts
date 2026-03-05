/**
 * YTS.mx API service — calls the Rust backend which proxies
 * to the YTS API (bypasses DNS blocks in the webview).
 */

const isTauri = !!(window as any).__TAURI_INTERNALS__;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauri) {
        throw new Error('YTS search requires the desktop app');
    }
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
}

// YTS tracker list for constructing magnet links
const TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.tracker.cl:1337/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.cyberia.is:6969/announce',
    'udp://9.rarbg.com:2810/announce',
    'udp://tracker.tiny-vps.com:6969/announce',
    'udp://retracker.lanta-net.ru:2710/announce',
    'udp://tracker.zer0day.to:1337/announce',
    'http://tracker.openbittorrent.com:80/announce',
];

/* ---------- Types ---------- */

export interface YTSTorrent {
    url: string | null;
    hash: string;
    quality: string;        // "720p", "1080p", "2160p", "3D"
    torrent_type: string | null;  // "bluray", "web" — renamed from "type" by serde
    seeds: number | null;
    peers: number | null;
    size: string | null;           // e.g. "1.15 GB"
    size_bytes: number | null;
    video_codec: string | null;
    audio_channels: string | null;
}

export interface YTSMovie {
    id: number;
    title: string;
    title_long: string | null;
    year: number | null;
    rating: number | null;
    runtime: number | null;
    genres: string[] | null;
    summary: string | null;
    small_cover_image: string | null;
    medium_cover_image: string | null;
    large_cover_image: string | null;
    torrents: YTSTorrent[] | null;
}

/* ---------- API ---------- */

/**
 * Search YTS for movies by title via the Rust backend.
 * Throws on error so the caller can display the message.
 */
export async function searchYTSMovies(query: string): Promise<YTSMovie[]> {
    try {
        const result = await invoke<YTSMovie[]>('yts_search', { query });
        console.log('[YTS] Got results:', result?.length ?? 0, 'movies');
        return result;
    } catch (err: any) {
        const msg = typeof err === 'string' ? err : err?.message ?? String(err);
        console.error('YTS search failed:', msg);
        throw new Error(msg);
    }
}

/* ---------- Helpers ---------- */

/**
 * Build a magnet link from a YTS torrent hash and movie name.
 */
export function buildMagnetLink(hash: string, movieName: string): string {
    const encodedName = encodeURIComponent(movieName);
    const trackerParams = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    const link = `magnet:?xt=urn:btih:${hash}&dn=${encodedName}${trackerParams}`;
    console.log('[YTS] Generated Magnet Link:', link);
    return link;
}

/**
 * Get a quality badge color based on quality string.
 */
export function getQualityColor(quality: string): string {
    switch (quality) {
        case '2160p': return '#ffd700';   // gold for 4K
        case '1080p': return '#46d369';   // green for Full HD
        case '720p': return '#0080ff';   // blue for HD
        case '3D': return '#e87c03';   // orange for 3D
        default: return '#b3b3b3';   // gray for other
    }
}

/**
 * Get a quality label.
 */
export function getQualityLabel(quality: string): string {
    switch (quality) {
        case '2160p': return '4K UHD';
        case '1080p': return 'Full HD';
        case '720p': return 'HD';
        case '3D': return '3D';
        default: return quality;
    }
}
