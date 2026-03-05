/**
 * PreScreenModal — lets a user download the room's movie before joining.
 *
 * Behaviour:
 *   - Room downloaded via app (has magnetLink): auto-starts the download
 *   - Room with manually chosen file (no magnetLink): shows YTS search with warning
 *
 * On completion the file path + subtitle path are stored in localStorage
 * so RoomPage can auto-apply them when the user joins.
 */
import { useState, useEffect } from 'react';
import { addMagnet, getProgress, scanDirectoryForMedia, getDefaultDownloadDir, formatBytes, TorrentProgress } from '../lib/torrent';
import { searchYTSMovies, YTSMovie, YTSTorrent, buildMagnetLink, getQualityColor, getQualityLabel } from '../lib/yts';
import {
    getSavedDownloadDir,
    saveDownloadDir,
    buildMovieDownloadDir,
    pickVideoFile,
    pickSubtitleFile,
    savePreScreenData,
} from '../lib/downloadDir';
import { open } from '@tauri-apps/plugin-dialog';

interface PreScreenModalProps {
    roomId: string;
    movieTitle: string;
    magnetLink?: string;          // set if admin downloaded via app
    localFileSource?: 'downloaded' | 'manual';
    onClose: () => void;
}

const isTauri = !!(window as any).__TAURI_INTERNALS__;

export function PreScreenModal({ roomId, movieTitle, magnetLink, localFileSource, onClose }: PreScreenModalProps) {
    const isAdminDownloaded = !!magnetLink && localFileSource === 'downloaded';

    // Download dir
    const [downloadDir, setDownloadDir] = useState('');
    const [showDirPrompt, setShowDirPrompt] = useState(false);

    // YTS search (for manual-source rooms)
    const [ytsSearching, setYtsSearching] = useState(false);
    const [ytsMovies, setYtsMovies] = useState<YTSMovie[]>([]);
    const [ytsError, setYtsError] = useState('');
    const [selectedYtsMovie, setSelectedYtsMovie] = useState<YTSMovie | null>(null);
    const [selectedTorrent, setSelectedTorrent] = useState<YTSTorrent | null>(null);
    const [showManualMagnet, setShowManualMagnet] = useState(false);
    const [manualMagnet, setManualMagnet] = useState('');

    // Download state
    const [downloadError, setDownloadError] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [activeTorrentId, setActiveTorrentId] = useState<number | null>(null);
    const [dlProgress, setDlProgress] = useState<TorrentProgress | null>(null);
    const [detectedFile, setDetectedFile] = useState<string | null>(null);
    const [detectedSubtitle, setDetectedSubtitle] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    // Load saved download dir on mount
    useEffect(() => {
        const saved = getSavedDownloadDir();
        if (saved) {
            setDownloadDir(saved);
        } else {
            setShowDirPrompt(true);
            if (isTauri) {
                getDefaultDownloadDir()
                    .then((d) => {
                        const sep = d.includes('\\') ? '\\' : '/';
                        setDownloadDir(`${d}${sep}Absolute Cinema`);
                    })
                    .catch(() => {});
            }
        }
    }, []);

    // For manual-source rooms: auto-search YTS
    useEffect(() => {
        if (isAdminDownloaded || showDirPrompt) return;
        if (ytsMovies.length === 0 && !ytsSearching && !ytsError) {
            runYtsSearch();
        }
    }, [isAdminDownloaded, showDirPrompt]);

    // Poll download progress
    useEffect(() => {
        if (activeTorrentId === null) return;
        const interval = setInterval(async () => {
            try {
                const p = await getProgress(activeTorrentId);
                setDlProgress(p);
                if (p.progress_pct >= 100) {
                    clearInterval(interval);
                    const movieDlDir = buildMovieDownloadDir(downloadDir, movieTitle);
                    try {
                        const files = await scanDirectoryForMedia(movieDlDir);
                        const videoFile = pickVideoFile(files);
                        const subtitleFile = pickSubtitleFile(files);
                        setDetectedFile(videoFile);
                        setDetectedSubtitle(subtitleFile);
                        if (videoFile) {
                            savePreScreenData(roomId, {
                                filePath: videoFile,
                                subtitlePath: subtitleFile ?? undefined,
                            });
                            setSaved(true);
                        }
                    } catch { /* ignore */ }
                }
            } catch { /* ignore */ }
        }, 1000);
        return () => clearInterval(interval);
    }, [activeTorrentId, downloadDir, movieTitle, roomId]);

    const runYtsSearch = async () => {
        setYtsSearching(true);
        setYtsError('');
        try {
            const results = await searchYTSMovies(movieTitle);
            setYtsMovies(results);
            const exact = results.find((m) => m.title.toLowerCase() === movieTitle.toLowerCase());
            if (exact) setSelectedYtsMovie(exact);
        } catch (err: any) {
            setYtsError(err?.message || 'Search failed');
        } finally {
            setYtsSearching(false);
        }
    };

    const handleUseDefaultDir = async () => {
        let base = downloadDir;
        if (!base && isTauri) {
            try { base = await getDefaultDownloadDir(); } catch { base = ''; }
        }
        // Strip the trailing "Absolute Cinema" if already there, then re-add properly
        const sep = base.includes('\\') ? '\\' : '/';
        const clean = base.replace(/[/\\]Absolute Cinema\s*$/, '');
        const defaultDir = `${clean}${sep}Absolute Cinema`;
        setDownloadDir(defaultDir);
        saveDownloadDir(defaultDir);
        setShowDirPrompt(false);
    };

    const handleBrowseDir = async () => {
        try {
            const selected = await open({ directory: true, multiple: false });
            if (selected) {
                const dir = typeof selected === 'string' ? selected : (selected as any).path || String(selected);
                setDownloadDir(dir);
            }
        } catch { /* ignore */ }
    };

    const handleConfirmDir = () => {
        if (!downloadDir.trim()) return;
        saveDownloadDir(downloadDir.trim());
        setShowDirPrompt(false);
    };

    const startDownload = async (magnet: string) => {
        setDownloadError('');
        setIsStarting(true);
        try {
            const movieDlDir = buildMovieDownloadDir(downloadDir, movieTitle);
            const id = await addMagnet(magnet, movieDlDir);
            setActiveTorrentId(id);
        } catch (err: any) {
            setDownloadError(err?.message || 'Failed to start download');
        } finally {
            setIsStarting(false);
        }
    };

    // For admin-downloaded rooms, auto-start when dir is ready
    useEffect(() => {
        if (!isAdminDownloaded || showDirPrompt || activeTorrentId !== null || !downloadDir || !magnetLink) return;
        startDownload(magnetLink);
    }, [isAdminDownloaded, showDirPrompt, downloadDir]);

    const handleYtsConfirm = () => {
        if (!selectedYtsMovie || !selectedTorrent) return;
        const magnet = buildMagnetLink(selectedTorrent.hash, selectedYtsMovie.title_long || selectedYtsMovie.title);
        startDownload(magnet);
    };

    const handleManualDownload = () => {
        if (!manualMagnet.trim().startsWith('magnet:')) {
            setDownloadError('Please enter a valid magnet link');
            return;
        }
        startDownload(manualMagnet.trim());
    };

    const isDownloading = activeTorrentId !== null;
    const isComplete = dlProgress && dlProgress.progress_pct >= 100;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ maxWidth: '520px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Pre-screen
                    </h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                    {/* Movie title */}
                    <div style={{ padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--primary)', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Movie</span>
                        <span style={{ fontWeight: 600 }}>{movieTitle}</span>
                    </div>

                    {/* Warning for manual-source rooms */}
                    {!isAdminDownloaded && (
                        <div style={{ padding: '10px 14px', background: 'rgba(245, 166, 35, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 166, 35, 0.3)', marginBottom: '4px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--warning)', fontSize: '0.85rem', marginBottom: '4px' }}>⚠ Custom File Room</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                This room uses a manually chosen file. Your downloaded copy may not sync properly — please contact the room admin for clarification.
                            </div>
                        </div>
                    )}

                    {isAdminDownloaded && !isDownloading && (
                        <div style={{ padding: '10px 14px', background: 'rgba(70, 211, 105, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(70, 211, 105, 0.25)', marginBottom: '4px' }}>
                            <div style={{ fontSize: '0.82rem', color: '#46d369' }}>
                                ✓ Downloading the same version the admin used. Playback will sync perfectly.
                            </div>
                        </div>
                    )}

                    {!isTauri && (
                        <div style={{ color: 'var(--warning)', fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(245, 166, 35, 0.1)', borderRadius: 'var(--radius-md)' }}>
                            ⚠ Torrent downloads require the desktop app.
                        </div>
                    )}

                    {/* Download dir prompt */}
                    {showDirPrompt && (
                        <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Choose your download folder</div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input className="input" style={{ flex: 1, fontSize: '0.85rem' }} value={downloadDir} onChange={(e) => setDownloadDir(e.target.value)} placeholder="Download folder path..." />
                                {isTauri && <button type="button" className="btn btn-secondary" onClick={handleBrowseDir} style={{ flexShrink: 0 }}>Browse</button>}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button type="button" className="btn btn-primary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={handleUseDefaultDir}>
                                    Use default ("Absolute Cinema" in Downloads)
                                </button>
                                <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleConfirmDir}>
                                    Use this
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Download dir display */}
                    {!showDirPrompt && downloadDir && !isDownloading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>Save to:</span>
                            <span style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{buildMovieDownloadDir(downloadDir, movieTitle)}</span>
                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '2px 6px', flexShrink: 0 }} onClick={() => setShowDirPrompt(true)}>Change</button>
                        </div>
                    )}

                    {/* === Manual source: YTS search === */}
                    {!isAdminDownloaded && !showDirPrompt && !isDownloading && (
                        <>
                            {ytsSearching && (
                                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                    <div className="spinner" style={{ width: '28px', height: '28px', margin: '0 auto 8px' }} />
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Searching YTS...</p>
                                </div>
                            )}

                            {!ytsSearching && !showManualMagnet && (
                                <>
                                    {(ytsError || ytsMovies.length === 0) && (
                                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px' }}>
                                                {ytsError ? 'YTS search failed' : 'No results found on YTS'}
                                            </p>
                                            {ytsError && <p style={{ color: '#e50914', fontSize: '0.78rem', marginBottom: '10px', fontFamily: 'monospace' }}>{ytsError}</p>}
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button type="button" className="btn btn-secondary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={runYtsSearch}>Retry</button>
                                                <button type="button" className="btn btn-secondary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={() => setShowManualMagnet(true)}>Enter magnet manually</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Movie list */}
                                    {!selectedYtsMovie && ytsMovies.length > 0 && (
                                        <div>
                                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Select movie:</p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {ytsMovies.map((movie) => (
                                                    <button key={movie.id} type="button" className="torrent-item" onClick={() => setSelectedYtsMovie(movie)} style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid var(--glass-border)', background: 'var(--bg-tertiary)' }}>
                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                            <img src={movie.small_cover_image ?? undefined} alt="" style={{ width: '36px', height: '54px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { (e.target as any).style.display = 'none'; }} />
                                                            <div>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{movie.title}</div>
                                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{movie.year} · {movie.torrents?.length || 0} qualities</div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <button type="button" className="btn btn-ghost" onClick={() => setShowManualMagnet(true)} style={{ width: '100%', marginTop: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                                Or enter magnet link manually
                                            </button>
                                        </div>
                                    )}

                                    {/* Quality selection */}
                                    {selectedYtsMovie && !selectedTorrent && (
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                                <img src={selectedYtsMovie.medium_cover_image ?? undefined} alt="" style={{ width: '44px', height: '66px', borderRadius: '4px', objectFit: 'cover' }} onError={(e) => { (e.target as any).style.display = 'none'; }} />
                                                <div>
                                                    <div style={{ fontWeight: 700 }}>{selectedYtsMovie.title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedYtsMovie.year}</div>
                                                </div>
                                                {ytsMovies.length > 1 && (
                                                    <button type="button" className="btn btn-ghost" onClick={() => setSelectedYtsMovie(null)} style={{ marginLeft: 'auto', fontSize: '0.78rem', padding: '3px 8px' }}>Change</button>
                                                )}
                                            </div>
                                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Choose quality:</p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {(selectedYtsMovie.torrents || []).map((torrent, i) => {
                                                    const qColor = getQualityColor(torrent.quality);
                                                    return (
                                                        <button key={i} type="button" className="yts-torrent-option" onClick={() => setSelectedTorrent(torrent)}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                                                                <div style={{ background: `${qColor}22`, border: `1px solid ${qColor}44`, color: qColor, padding: '4px 12px', borderRadius: '6px', fontWeight: 700, fontSize: '0.9rem', minWidth: '70px', textAlign: 'center' }}>{torrent.quality}</div>
                                                                <div style={{ flex: 1, textAlign: 'left' }}>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{getQualityLabel(torrent.quality)}</div>
                                                                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                                        <span>📦 {torrent.size ?? '?'}</span>
                                                                        <span style={{ color: '#46d369' }}>▲ {torrent.seeds ?? 0} seeds</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Confirm download */}
                                    {selectedYtsMovie && selectedTorrent && !isDownloading && (
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: '8px', border: `1px solid ${getQualityColor(selectedTorrent.quality)}44`, marginBottom: '10px' }}>
                                                <div style={{ background: `${getQualityColor(selectedTorrent.quality)}22`, color: getQualityColor(selectedTorrent.quality), padding: '3px 10px', borderRadius: '5px', fontWeight: 700, fontSize: '0.88rem' }}>{selectedTorrent.quality}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600 }}>{selectedYtsMovie.title}</div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedTorrent.size} · {selectedTorrent.seeds ?? 0} seeds</div>
                                                </div>
                                                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTorrent(null)} style={{ fontSize: '0.78rem', padding: '3px 8px' }}>Change</button>
                                            </div>
                                            {downloadError && <div style={{ color: '#e50914', fontSize: '0.82rem', padding: '6px 10px', background: 'rgba(229,9,20,0.1)', borderRadius: '6px', marginBottom: '8px' }}>{downloadError}</div>}
                                            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleYtsConfirm} disabled={isStarting || !isTauri}>
                                                {isStarting ? <><div className="spinner" style={{ width: '14px', height: '14px', display: 'inline-block', marginRight: '6px' }} />Starting...</> : `⬇ Download ${selectedTorrent.quality}`}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Manual magnet */}
                            {showManualMagnet && (
                                <div>
                                    <div className="input-group">
                                        <label style={{ fontSize: '0.85rem' }}>Magnet Link</label>
                                        <textarea className="input" placeholder="magnet:?xt=urn:btih:..." value={manualMagnet} onChange={(e) => setManualMagnet(e.target.value)} style={{ minHeight: '70px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }} />
                                    </div>
                                    {downloadError && <div style={{ color: '#e50914', fontSize: '0.82rem', padding: '6px 10px', background: 'rgba(229,9,20,0.1)', borderRadius: '6px', marginBottom: '8px' }}>{downloadError}</div>}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button type="button" className="btn btn-ghost" onClick={() => { setShowManualMagnet(false); setDownloadError(''); }} style={{ fontSize: '0.82rem' }}>← Back</button>
                                        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleManualDownload} disabled={isStarting || !isTauri}>
                                            {isStarting ? 'Starting...' : '⬇ Start Download'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* === Auto-start for admin-downloaded rooms === */}
                    {isAdminDownloaded && !showDirPrompt && !isDownloading && isStarting && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div className="spinner" style={{ width: '28px', height: '28px', margin: '0 auto 8px' }} />
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Starting download...</p>
                        </div>
                    )}

                    {/* Download progress */}
                    {isDownloading && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                                    {dlProgress?.name || 'Resolving magnet...'}
                                </span>
                                {isComplete ? (
                                    <span style={{ color: '#46d369', fontWeight: 700, fontSize: '0.85rem' }}>✓ Complete</span>
                                ) : (
                                    <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem' }}>{(dlProgress?.progress_pct ?? 0).toFixed(1)}%</span>
                                )}
                            </div>
                            <div className="torrent-progress-track" style={{ height: '7px' }}>
                                <div className="torrent-progress-bar" style={{ width: `${Math.min(dlProgress?.progress_pct ?? 0, 100)}%`, background: isComplete ? '#46d369' : 'var(--gradient-primary)' }} />
                            </div>
                            {dlProgress && (
                                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <span>{formatBytes(dlProgress.downloaded_bytes)} / {formatBytes(dlProgress.total_bytes)}</span>
                                    <span style={{ color: '#46d369' }}>↓ {dlProgress.download_speed.toFixed(1)} MB/s</span>
                                    <span>{dlProgress.peers} peers</span>
                                </div>
                            )}

                            {isComplete && saved && (
                                <div style={{ marginTop: '12px', padding: '12px 14px', background: 'rgba(70, 211, 105, 0.1)', border: '1px solid rgba(70, 211, 105, 0.3)', borderRadius: '10px' }}>
                                    <div style={{ color: '#46d369', fontWeight: 600, marginBottom: '6px' }}>✓ All set!</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                        Your file is ready. When you join this room, it will be automatically loaded.
                                    </div>
                                    {detectedFile && (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {detectedFile.split(/[\\/]/).pop()}
                                        </div>
                                    )}
                                    {detectedSubtitle && (
                                        <div style={{ fontSize: '0.78rem', color: '#46d369', marginTop: '4px' }}>
                                            Subtitle: {detectedSubtitle.split(/[\\/]/).pop()}
                                        </div>
                                    )}
                                </div>
                            )}

                            {isComplete && !saved && !detectedFile && (
                                <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(245, 166, 35, 0.1)', border: '1px solid rgba(245, 166, 35, 0.3)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--warning)' }}>
                                    ⚠ Could not detect video file in download folder. Please select the file manually in the room.
                                </div>
                            )}
                        </div>
                    )}

                    {downloadError && !isDownloading && (
                        <div style={{ color: '#e50914', fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(229, 9, 20, 0.1)', borderRadius: 'var(--radius-md)' }}>{downloadError}</div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        {isComplete ? 'Close' : 'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    );
}
