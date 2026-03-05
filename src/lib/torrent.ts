/**
 * Torrent service – calls Tauri commands exposed from the Rust backend.
 * Falls back gracefully when running outside of Tauri (browser dev mode).
 */

const isTauri = !!(window as any).__TAURI_INTERNALS__;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauri) {
        throw new Error('Torrent features require the desktop app');
    }
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(cmd, args);
}

/* ---------- Types ---------- */

export interface TorrentProgress {
    id: number;
    name: string;
    progress_pct: number;
    downloaded_bytes: number;
    total_bytes: number;
    download_speed: number;
    upload_speed: number;
    state: string;
    peers: number;
}

export interface TorrentListItem {
    id: number;
    name: string;
    progress_pct: number;
    state: string;
    download_speed: number;
    total_bytes: number;
    downloaded_bytes: number;
}

/* ---------- API ---------- */

export async function addMagnet(magnetLink: string, downloadDir: string): Promise<number> {
    return invoke<number>('torrent_add_magnet', {
        magnetLink,
        downloadDir,
    });
}

export async function getProgress(torrentId: number): Promise<TorrentProgress> {
    return invoke<TorrentProgress>('torrent_get_progress', { torrentId });
}

export async function listTorrents(): Promise<TorrentListItem[]> {
    return invoke<TorrentListItem[]>('torrent_list');
}

export async function pauseTorrent(torrentId: number): Promise<void> {
    return invoke<void>('torrent_pause', { torrentId });
}

export async function deleteTorrent(torrentId: number): Promise<void> {
    return invoke<void>('torrent_delete', { torrentId });
}

export async function getDefaultDownloadDir(): Promise<string> {
    return invoke<string>('get_default_download_dir');
}

export async function scanDirectoryForMedia(dirPath: string): Promise<string[]> {
    return invoke<string[]>('scan_directory_for_media', { dirPath });
}

/* ---------- Helpers ---------- */

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSec: number): string {
    return formatBytes(bytesPerSec) + '/s';
}
