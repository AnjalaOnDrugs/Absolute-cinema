/**
 * Utilities for managing the user's preferred download directory
 * and pre-screen data (file/subtitle paths prepared before joining a room).
 */

const DOWNLOAD_DIR_KEY = 'ac_downloadDir';

export function getSavedDownloadDir(): string | null {
    return localStorage.getItem(DOWNLOAD_DIR_KEY);
}

export function saveDownloadDir(dir: string): void {
    localStorage.setItem(DOWNLOAD_DIR_KEY, dir);
}

/** Returns true if the user has a saved download dir */
export function hasDownloadDir(): boolean {
    return !!localStorage.getItem(DOWNLOAD_DIR_KEY);
}

/** Build the per-movie subdirectory inside the base download dir */
export function buildMovieDownloadDir(baseDir: string, movieTitle: string): string {
    const safe = movieTitle.replace(/[<>:"/\\|?*]/g, '').trim();
    const sep = baseDir.includes('\\') ? '\\' : '/';
    return `${baseDir}${sep}${safe}`;
}

/* ---------- Pre-screen data ---------- */

export interface PreScreenData {
    filePath?: string;
    subtitlePath?: string;
    torrentId?: number;
    magnetLink?: string;
    downloadDir?: string;
    movieTitle?: string;
}

export function getPreScreenData(roomId: string): PreScreenData | null {
    const raw = localStorage.getItem(`ac_prescreen_${roomId}`);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as PreScreenData;
    } catch {
        return null;
    }
}

export function savePreScreenData(roomId: string, data: PreScreenData): void {
    localStorage.setItem(`ac_prescreen_${roomId}`, JSON.stringify(data));
}

export function clearPreScreenData(roomId: string): void {
    localStorage.removeItem(`ac_prescreen_${roomId}`);
}

/** Pick the best video file from a list of scanned paths (largest .mkv or .mp4 first) */
export function pickVideoFile(files: string[]): string | null {
    const VIDEO_EXTS = ['mkv', 'mp4', 'avi', 'mov', 'webm', 'flv', 'm4v'];
    const videos = files.filter((f) => {
        const ext = f.split('.').pop()?.toLowerCase() ?? '';
        return VIDEO_EXTS.includes(ext);
    });
    if (videos.length === 0) return null;
    // Prefer mkv/mp4, otherwise first found
    const preferred = videos.find((f) => /\.(mkv|mp4)$/i.test(f));
    return preferred ?? videos[0];
}

/** Pick the first subtitle file from a list of scanned paths */
export function pickSubtitleFile(files: string[]): string | null {
    const SUB_EXTS = ['srt', 'ass', 'vtt', 'sub', 'ssa'];
    return (
        files.find((f) => {
            const ext = f.split('.').pop()?.toLowerCase() ?? '';
            return SUB_EXTS.includes(ext);
        }) ?? null
    );
}
