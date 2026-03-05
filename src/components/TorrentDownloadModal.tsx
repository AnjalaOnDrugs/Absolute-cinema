import { useState, useEffect } from 'react';
import { addMagnet, getDefaultDownloadDir, getProgress, TorrentProgress, formatBytes } from '../lib/torrent';
import { searchYTSMovies, YTSMovie, YTSTorrent, buildMagnetLink, getQualityColor, getQualityLabel } from '../lib/yts';

interface TorrentDownloadModalProps {
    movieTitle: string;
    onClose: () => void;
}

const isTauri = !!(window as any).__TAURI_INTERNALS__;

export function TorrentDownloadModal({ movieTitle, onClose }: TorrentDownloadModalProps) {
    // Search state
    const [isSearching, setIsSearching] = useState(true);
    const [ytsMovies, setYtsMovies] = useState<YTSMovie[]>([]);
    const [selectedMovie, setSelectedMovie] = useState<YTSMovie | null>(null);
    const [selectedTorrent, setSelectedTorrent] = useState<YTSTorrent | null>(null);
    const [searchError, setSearchError] = useState('');
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualMagnet, setManualMagnet] = useState('');

    // Download state
    const [downloadDir, setDownloadDir] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState('');
    const [activeTorrentId, setActiveTorrentId] = useState<number | null>(null);
    const [progress, setProgress] = useState<TorrentProgress | null>(null);

    // Fetch default download dir
    useEffect(() => {
        if (isTauri) {
            getDefaultDownloadDir()
                .then(setDownloadDir)
                .catch(() => setDownloadDir('C:\\Downloads'));
        }
    }, []);

    // Auto-search YTS on mount
    useEffect(() => {
        const search = async () => {
            setIsSearching(true);
            setSearchError('');
            try {
                const results = await searchYTSMovies(movieTitle);
                setYtsMovies(results);
                // Auto-select the first movie if we get an exact or close match
                if (results.length > 0) {
                    const exactMatch = results.find(
                        m => m.title.toLowerCase() === movieTitle.toLowerCase()
                    );
                    if (exactMatch) {
                        setSelectedMovie(exactMatch);
                    }
                }
            } catch (err: any) {
                const msg = err?.message || String(err);
                console.error('[TorrentModal] YTS search error:', msg);
                setSearchError(msg);
            } finally {
                setIsSearching(false);
            }
        };
        search();
    }, [movieTitle]);

    // Poll progress when a torrent is active
    useEffect(() => {
        if (activeTorrentId === null) return;
        const interval = setInterval(async () => {
            try {
                const p = await getProgress(activeTorrentId);
                setProgress(p);
                if (p.progress_pct >= 100) clearInterval(interval);
            } catch { /* ignore */ }
        }, 1000);
        return () => clearInterval(interval);
    }, [activeTorrentId]);

    const handleStartDownload = async (magnet: string) => {
        setError('');
        setIsStarting(true);
        try {
            const id = await addMagnet(magnet, downloadDir);
            setActiveTorrentId(id);
        } catch (err: any) {
            setError(err?.message || 'Failed to start download');
        } finally {
            setIsStarting(false);
        }
    };

    const handleTorrentSelect = (torrent: YTSTorrent) => {
        setSelectedTorrent(torrent);
    };

    const handleConfirmDownload = () => {
        if (!selectedMovie || !selectedTorrent) return;
        const magnet = buildMagnetLink(selectedTorrent.hash, selectedMovie.title_long || selectedMovie.title);
        handleStartDownload(magnet);
    };

    const handleManualDownload = () => {
        if (!manualMagnet.trim() || !manualMagnet.startsWith('magnet:')) {
            setError('Please enter a valid magnet link');
            return;
        }
        handleStartDownload(manualMagnet);
    };

    const isDownloading = activeTorrentId !== null;
    const isComplete = progress && progress.progress_pct >= 100;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                style={{ maxWidth: '580px', width: '95%' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 className="modal-title" style={{ fontSize: '1.3rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Download Torrent
                        </span>
                    </h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                    {/* Movie title bar */}
                    <div style={{
                        padding: '12px 16px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        borderLeft: '3px solid var(--primary)',
                    }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Movie</span>
                        <span style={{ fontWeight: 600 }}>{movieTitle}</span>
                    </div>

                    {!isTauri && (
                        <div style={{
                            color: 'var(--warning)',
                            fontSize: '0.85rem',
                            padding: '8px 12px',
                            background: 'rgba(245, 166, 35, 0.1)',
                            borderRadius: 'var(--radius-md)',
                        }}>
                            ⚠ Torrent downloads require the desktop app.
                        </div>
                    )}

                    {/* === PHASE 1: Searching YTS === */}
                    {!isDownloading && isSearching && (
                        <div style={{ textAlign: 'center', padding: '30px 0' }}>
                            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto 12px' }} />
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                                Searching YTS for torrents...
                            </p>
                        </div>
                    )}

                    {/* === PHASE 2: Show YTS results === */}
                    {!isDownloading && !isSearching && !showManualInput && (
                        <>
                            {(ytsMovies.length === 0 || searchError) ? (
                                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.5 }}>{searchError ? '⚠️' : '🔍'}</div>
                                    <p style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                        {searchError ? 'YTS search failed' : 'No results found on YTS'}
                                    </p>
                                    {searchError && (
                                        <p style={{
                                            color: '#e50914',
                                            fontSize: '0.8rem',
                                            marginBottom: '8px',
                                            padding: '8px 12px',
                                            background: 'rgba(229, 9, 20, 0.1)',
                                            borderRadius: 'var(--radius-md)',
                                            textAlign: 'left',
                                            fontFamily: 'monospace',
                                            wordBreak: 'break-word',
                                        }}>
                                            {searchError}
                                        </p>
                                    )}
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                                        {searchError
                                            ? 'The YTS API may be blocked by your ISP. Try using a VPN or enter a magnet link manually.'
                                            : 'The movie may not be available on YTS, or it may be listed under a different name.'}
                                    </p>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowManualInput(true)}
                                        style={{ fontSize: '0.9rem' }}
                                    >
                                        Enter magnet link manually
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Movie selection (if multiple results) */}
                                    {!selectedMovie && (
                                        <div>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                                                Select the correct movie:
                                            </p>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {ytsMovies.map((movie) => (
                                                    <button
                                                        key={movie.id}
                                                        className="torrent-item"
                                                        onClick={() => setSelectedMovie(movie)}
                                                        style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid var(--glass-border)', background: 'var(--bg-tertiary)' }}
                                                    >
                                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                                                            <img
                                                                src={movie.small_cover_image ?? undefined}
                                                                alt=""
                                                                style={{ width: '40px', height: '60px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                            />
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{movie.title}</div>
                                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{movie.year ?? ''}</span>
                                                                    {(movie.rating ?? 0) > 0 && (
                                                                        <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                                                                            ★ {movie.rating}
                                                                        </span>
                                                                    )}
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                        {movie.torrents?.length || 0} torrent{(movie.torrents?.length || 0) !== 1 ? 's' : ''}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="9 18 15 12 9 6" />
                                                            </svg>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                            <button
                                                className="btn btn-ghost"
                                                onClick={() => setShowManualInput(true)}
                                                style={{ width: '100%', marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}
                                            >
                                                Or enter magnet link manually
                                            </button>
                                        </div>
                                    )}

                                    {/* Quality selection for the selected movie */}
                                    {selectedMovie && !selectedTorrent && (
                                        <div>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                marginBottom: '16px',
                                            }}>
                                                <img
                                                    src={selectedMovie.medium_cover_image ?? undefined}
                                                    alt=""
                                                    style={{ width: '50px', height: '75px', borderRadius: '6px', objectFit: 'cover' }}
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{selectedMovie.title}</div>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedMovie.year}</span>
                                                        {(selectedMovie.rating ?? 0) > 0 && (
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>★ {selectedMovie.rating}</span>
                                                        )}
                                                        {(selectedMovie.runtime ?? 0) > 0 && (
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedMovie.runtime} min</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {ytsMovies.length > 1 && (
                                                    <button
                                                        className="btn btn-ghost"
                                                        onClick={() => setSelectedMovie(null)}
                                                        style={{ marginLeft: 'auto', fontSize: '0.8rem', padding: '4px 10px' }}
                                                    >
                                                        Change
                                                    </button>
                                                )}
                                            </div>

                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                                                Choose quality:
                                            </p>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {(selectedMovie.torrents || []).map((torrent, i) => {
                                                    const qualityColor = getQualityColor(torrent.quality);
                                                    return (
                                                        <button
                                                            key={i}
                                                            className="yts-torrent-option"
                                                            onClick={() => handleTorrentSelect(torrent)}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                                                                {/* Quality badge */}
                                                                <div style={{
                                                                    background: `${qualityColor}22`,
                                                                    border: `1px solid ${qualityColor}44`,
                                                                    color: qualityColor,
                                                                    padding: '6px 14px',
                                                                    borderRadius: '6px',
                                                                    fontWeight: 700,
                                                                    fontSize: '0.95rem',
                                                                    minWidth: '80px',
                                                                    textAlign: 'center',
                                                                }}>
                                                                    {torrent.quality}
                                                                </div>

                                                                {/* Info */}
                                                                <div style={{ flex: 1, textAlign: 'left' }}>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                                                        {getQualityLabel(torrent.quality)}
                                                                        {torrent.torrent_type && (
                                                                            <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px', fontSize: '0.8rem' }}>
                                                                                {torrent.torrent_type.toUpperCase()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '12px', marginTop: '3px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                        <span>📦 {torrent.size ?? '?'}</span>
                                                                        <span style={{ color: '#46d369' }}>▲ {torrent.seeds ?? 0} seeds</span>
                                                                        <span>▼ {torrent.peers ?? 0} peers</span>
                                                                    </div>
                                                                </div>

                                                                {/* Download arrow */}
                                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={qualityColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                                    <polyline points="7 10 12 15 17 10" />
                                                                    <line x1="12" y1="15" x2="12" y2="3" />
                                                                </svg>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Confirm download with selected torrent */}
                                    {selectedMovie && selectedTorrent && !isDownloading && (
                                        <div>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '14px 16px',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: 'var(--radius-md)',
                                                border: `1px solid ${getQualityColor(selectedTorrent.quality)}44`,
                                            }}>
                                                <div style={{
                                                    background: `${getQualityColor(selectedTorrent.quality)}22`,
                                                    color: getQualityColor(selectedTorrent.quality),
                                                    padding: '4px 12px',
                                                    borderRadius: '6px',
                                                    fontWeight: 700,
                                                    fontSize: '0.9rem',
                                                }}>
                                                    {selectedTorrent.quality}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedMovie.title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                        {selectedTorrent.size ?? '?'} • {selectedTorrent.torrent_type?.toUpperCase() ?? ''} • {selectedTorrent.seeds ?? 0} seeds
                                                    </div>
                                                </div>
                                                <button
                                                    className="btn btn-ghost"
                                                    onClick={() => setSelectedTorrent(null)}
                                                    style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                                                >
                                                    Change
                                                </button>
                                            </div>

                                            {/* Download directory */}
                                            <div className="input-group" style={{ marginTop: '16px' }}>
                                                <label>Save to</label>
                                                <input
                                                    className="input"
                                                    type="text"
                                                    value={downloadDir}
                                                    onChange={(e) => setDownloadDir(e.target.value)}
                                                    style={{ fontSize: '0.9rem' }}
                                                />
                                            </div>

                                            {error && (
                                                <div style={{
                                                    color: '#e50914',
                                                    fontSize: '0.85rem',
                                                    padding: '8px 12px',
                                                    background: 'rgba(229, 9, 20, 0.1)',
                                                    borderRadius: 'var(--radius-md)',
                                                }}>
                                                    {error}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {/* === Manual magnet link input === */}
                    {!isDownloading && showManualInput && (
                        <>
                            <div className="input-group">
                                <label>Magnet Link</label>
                                <textarea
                                    className="input"
                                    placeholder="magnet:?xt=urn:btih:..."
                                    value={manualMagnet}
                                    onChange={(e) => setManualMagnet(e.target.value)}
                                    style={{
                                        minHeight: '80px',
                                        resize: 'vertical',
                                        fontFamily: 'monospace',
                                        fontSize: '0.85rem',
                                    }}
                                />
                            </div>
                            <div className="input-group">
                                <label>Save to</label>
                                <input
                                    className="input"
                                    type="text"
                                    value={downloadDir}
                                    onChange={(e) => setDownloadDir(e.target.value)}
                                    style={{ fontSize: '0.9rem' }}
                                />
                            </div>
                            {error && (
                                <div style={{
                                    color: '#e50914',
                                    fontSize: '0.85rem',
                                    padding: '8px 12px',
                                    background: 'rgba(229, 9, 20, 0.1)',
                                    borderRadius: 'var(--radius-md)',
                                }}>
                                    {error}
                                </div>
                            )}
                            <button
                                className="btn btn-ghost"
                                onClick={() => { setShowManualInput(false); setError(''); }}
                                style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
                            >
                                ← Back to search results
                            </button>
                        </>
                    )}

                    {/* === PHASE 3: Download progress === */}
                    {isDownloading && (
                        <div style={{ padding: '8px 0' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '8px',
                            }}>
                                <span style={{
                                    fontWeight: 600,
                                    fontSize: '0.95rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '320px',
                                }}>
                                    {progress?.name || 'Resolving magnet...'}
                                </span>
                                {isComplete ? (
                                    <span style={{ color: '#46d369', fontWeight: 700, fontSize: '0.9rem' }}>
                                        ✓ Complete
                                    </span>
                                ) : (
                                    <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                                        {(progress?.progress_pct ?? 0).toFixed(1)}%
                                    </span>
                                )}
                            </div>

                            {/* Progress bar */}
                            <div className="torrent-progress-track" style={{ height: '8px' }}>
                                <div
                                    className="torrent-progress-bar"
                                    style={{
                                        width: `${Math.min(progress?.progress_pct ?? 0, 100)}%`,
                                        background: isComplete ? '#46d369' : 'var(--gradient-primary)',
                                    }}
                                />
                            </div>

                            {progress && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '12px',
                                    marginTop: '16px',
                                    fontSize: '0.85rem',
                                }}>
                                    <div style={{ padding: '10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Downloaded</div>
                                        <div style={{ fontWeight: 600 }}>
                                            {formatBytes(progress.downloaded_bytes)} / {formatBytes(progress.total_bytes)}
                                        </div>
                                    </div>
                                    <div style={{ padding: '10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Speed</div>
                                        <div style={{ fontWeight: 600, color: '#46d369' }}>
                                            ↓ {progress.download_speed.toFixed(1)} MB/s
                                        </div>
                                    </div>
                                    <div style={{ padding: '10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Peers</div>
                                        <div style={{ fontWeight: 600 }}>{progress.peers}</div>
                                    </div>
                                    <div style={{ padding: '10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>Status</div>
                                        <div style={{ fontWeight: 600 }}>{progress.state.replace(/"/g, '')}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        {isDownloading ? 'Close' : 'Cancel'}
                    </button>

                    {/* Confirm download button (YTS flow) */}
                    {!isDownloading && selectedMovie && selectedTorrent && !showManualInput && (
                        <button
                            className="btn btn-primary"
                            onClick={handleConfirmDownload}
                            disabled={isStarting || !isTauri}
                            style={{ opacity: isStarting ? 0.7 : 1 }}
                        >
                            {isStarting ? (
                                <>
                                    <div className="spinner" style={{ width: '16px', height: '16px' }} />
                                    Starting...
                                </>
                            ) : (
                                <>
                                    ⬇ Download {selectedTorrent.quality}
                                </>
                            )}
                        </button>
                    )}

                    {/* Manual magnet download button */}
                    {!isDownloading && showManualInput && (
                        <button
                            className="btn btn-primary"
                            onClick={handleManualDownload}
                            disabled={isStarting || !isTauri}
                            style={{ opacity: isStarting ? 0.7 : 1 }}
                        >
                            {isStarting ? (
                                <>
                                    <div className="spinner" style={{ width: '16px', height: '16px' }} />
                                    Starting...
                                </>
                            ) : (
                                '⬇ Start Download'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
