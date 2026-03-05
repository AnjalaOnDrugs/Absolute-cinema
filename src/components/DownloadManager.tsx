import { useState, useEffect, useRef } from 'react';
import {
    TorrentListItem,
    listTorrents,
    pauseTorrent,
    deleteTorrent,
    formatBytes,
} from '../lib/torrent';

interface DownloadManagerProps {
    onClose: () => void;
}

export function DownloadManager({ onClose }: DownloadManagerProps) {
    const [torrents, setTorrents] = useState<TorrentListItem[]>([]);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        const poll = async () => {
            try {
                const list = await listTorrents();
                setTorrents(list);
            } catch {
                // ignore – not in Tauri or no session
            }
        };

        poll();
        intervalRef.current = window.setInterval(poll, 1000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const handlePause = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await pauseTorrent(id);
        } catch (err) {
            console.error('Failed to pause:', err);
        }
    };

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Remove this download?')) return;
        try {
            await deleteTorrent(id);
            setTorrents((prev) => prev.filter((t) => t.id !== id));
        } catch (err) {
            console.error('Failed to delete:', err);
        }
    };

    const getStateLabel = (state: string, progress: number): { label: string; color: string } => {
        const s = state.toLowerCase();
        if (progress >= 100) return { label: 'Finished', color: '#46d369' };
        if (s.includes('live')) return { label: 'Downloading', color: '#0080ff' };
        if (s.includes('pause')) return { label: 'Paused', color: '#f5a623' };
        if (s.includes('check')) return { label: 'Checking', color: '#0080ff' };
        if (s.includes('error')) return { label: 'Error', color: '#e50914' };
        if (s.includes('initializing')) return { label: 'Starting...', color: '#0080ff' };
        return { label: state.replace(/"/g, ''), color: '#b3b3b3' };
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                style={{ maxWidth: '640px', width: '95%' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Downloads
                    </h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {torrents.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: 'var(--text-muted)',
                        }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: '12px' }}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <p style={{ fontSize: '1rem' }}>No active downloads</p>
                            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                                Use the download button on a movie card to start one
                            </p>
                        </div>
                    ) : (
                        torrents.map((t) => {
                            const { label, color } = getStateLabel(t.state, t.progress_pct);
                            return (
                                <div
                                    key={t.id}
                                    className="torrent-item"
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{
                                                fontWeight: 600,
                                                fontSize: '0.95rem',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '320px',
                                            }}>
                                                {t.name}
                                            </span>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                color,
                                                background: `${color}22`,
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                flexShrink: 0,
                                            }}>
                                                {label}
                                            </span>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="torrent-progress-track">
                                            <div
                                                className="torrent-progress-bar"
                                                style={{
                                                    width: `${Math.min(t.progress_pct, 100)}%`,
                                                    background: t.progress_pct >= 100 ? '#46d369' : undefined
                                                }}
                                            />
                                        </div>

                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            fontSize: '0.8rem',
                                            color: 'var(--text-muted)',
                                            marginTop: '6px',
                                        }}>
                                            <span>{t.progress_pct.toFixed(1)}%</span>
                                            <span>
                                                {formatBytes(t.downloaded_bytes)} / {formatBytes(t.total_bytes)}
                                            </span>
                                            {t.download_speed > 0 && (
                                                <span style={{ color: '#46d369' }}>
                                                    ↓ {t.download_speed.toFixed(1)} MB/s
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                                        {t.progress_pct < 100 && (
                                            <button
                                                className="btn btn-ghost btn-icon"
                                                style={{ padding: '6px', fontSize: '1rem' }}
                                                onClick={(e) => handlePause(t.id, e)}
                                                title="Pause"
                                            >
                                                ⏸
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-icon"
                                            style={{ padding: '6px', fontSize: '1rem', color: '#e50914' }}
                                            onClick={(e) => handleDelete(t.id, e)}
                                            title="Remove"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
