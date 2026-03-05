import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { searchMovies, TMDBMovie } from '../lib/tmdb';
import { open } from '@tauri-apps/plugin-dialog';
import { AddCustomMovieModal } from './AddCustomMovieModal';
import {
    addMagnet,
    getProgress,
    scanDirectoryForMedia,
    getDefaultDownloadDir,
    formatBytes,
    TorrentProgress,
} from '../lib/torrent';
import {
    searchYTSMovies,
    YTSMovie,
    YTSTorrent,
    buildMagnetLink,
    getQualityColor,
    getQualityLabel,
} from '../lib/yts';
import {
    getSavedDownloadDir,
    saveDownloadDir,
    buildMovieDownloadDir,
    pickVideoFile,
    pickSubtitleFile,
    savePreScreenData,
} from '../lib/downloadDir';

interface CreateRoomModalProps {
    onClose: () => void;
    initialMovieTitle?: string;
}

type SourceTab = 'youtube' | 'local';
type LocalSubTab = 'choose-file' | 'download';

const isTauri = !!(window as any).__TAURI_INTERNALS__;

export function CreateRoomModal({ onClose, initialMovieTitle }: CreateRoomModalProps) {
    // Progressive disclosure: only show all fields after a movie is selected
    const [movieSelected, setMovieSelected] = useState(!!initialMovieTitle);

    const [name, setName] = useState(initialMovieTitle ? `${initialMovieTitle} Room` : '');
    const [movieTitle, setMovieTitle] = useState(initialMovieTitle || '');
    const [movieFileName, setMovieFileName] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [everyoneCanControl, setEveryoneCanControl] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [tmdbId, setTmdbId] = useState<number | undefined>();
    const [moviePoster, setMoviePoster] = useState<string | undefined>();
    const [suggestions, setSuggestions] = useState<TMDBMovie[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mediaType, setMediaType] = useState('.mp4');
    const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
    const [showAddCustomMovie, setShowAddCustomMovie] = useState(false);
    const [sourceTab, setSourceTab] = useState<SourceTab>('youtube');
    const [localSubTab, setLocalSubTab] = useState<LocalSubTab>('choose-file');
    const suggestionRef = useRef<HTMLDivElement>(null);

    // --- Download flow state ---
    const [downloadDir, setDownloadDir] = useState('');
    const [showDirPrompt, setShowDirPrompt] = useState(false);
    const [ytsSearching, setYtsSearching] = useState(false);
    const [ytsMovies, setYtsMovies] = useState<YTSMovie[]>([]);
    const [ytsError, setYtsError] = useState('');
    const [selectedYtsMovie, setSelectedYtsMovie] = useState<YTSMovie | null>(null);
    const [selectedTorrent, setSelectedTorrent] = useState<YTSTorrent | null>(null);
    const [showManualMagnet, setShowManualMagnet] = useState(false);
    const [manualMagnet, setManualMagnet] = useState('');
    const [downloadError, setDownloadError] = useState('');
    const [isStartingDl, setIsStartingDl] = useState(false);
    const [activeTorrentId, setActiveTorrentId] = useState<number | null>(null);
    const [dlProgress, setDlProgress] = useState<TorrentProgress | null>(null);
    const [detectedSubtitle, setDetectedSubtitle] = useState<string | null>(null);
    const [magnetLink, setMagnetLink] = useState<string | null>(null);

    const mediaTypes = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv'];

    const { token } = useAuth();
    const navigate = useNavigate();
    const createRoomMutation = useMutation(api.rooms.createRoom);
    const customMovieResults = useQuery(
        api.customMovies.searchCustomMovies,
        movieTitle.length >= 2 ? { query: movieTitle } : 'skip'
    );

    // Fetch TMDB suggestions
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (movieTitle.length >= 4) {
                const results = await searchMovies(movieTitle);
                setSuggestions(results.slice(0, 5));
                setShowSuggestions(true);
            } else if (movieTitle.length >= 2) {
                setSuggestions([]);
                setShowSuggestions(true);
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        };
        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [movieTitle]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load saved download dir when switching to download subtab
    useEffect(() => {
        if (localSubTab !== 'download') return;
        const saved = getSavedDownloadDir();
        if (saved) {
            setDownloadDir(saved);
        } else {
            setShowDirPrompt(true);
            // Load default dir from system
            if (isTauri) {
                getDefaultDownloadDir().then((d) => setDownloadDir(d + '\\Absolute Cinema')).catch(() => {});
            }
        }
    }, [localSubTab]);

    // Auto-search YTS when switching to download tab and movie title is set
    useEffect(() => {
        if (localSubTab !== 'download' || !movieTitle || ytsMovies.length > 0 || ytsSearching) return;
        runYtsSearch();
    }, [localSubTab, movieTitle]);

    // Poll download progress
    useEffect(() => {
        if (activeTorrentId === null) return;
        const interval = setInterval(async () => {
            try {
                const p = await getProgress(activeTorrentId);
                setDlProgress(p);
                if (p.progress_pct >= 100) {
                    clearInterval(interval);
                    // Scan for files
                    const movieDlDir = buildMovieDownloadDir(downloadDir, movieTitle);
                    try {
                        const files = await scanDirectoryForMedia(movieDlDir);
                        const videoFile = pickVideoFile(files);
                        const subtitleFile = pickSubtitleFile(files);
                        if (videoFile) {
                            setSelectedFilePath(videoFile);
                            // Extract filename and extension for the room
                            const parts = videoFile.split(/[\\/]/);
                            const fullName = parts[parts.length - 1];
                            const lastDot = fullName.lastIndexOf('.');
                            if (lastDot !== -1) {
                                setMovieFileName(fullName.substring(0, lastDot));
                                const ext = fullName.substring(lastDot);
                                if (mediaTypes.includes(ext)) setMediaType(ext);
                            }
                        }
                        if (subtitleFile) setDetectedSubtitle(subtitleFile);
                    } catch {
                        // ignore scan errors
                    }
                }
            } catch { /* ignore */ }
        }, 1000);
        return () => clearInterval(interval);
    }, [activeTorrentId, downloadDir, movieTitle]);

    const runYtsSearch = async () => {
        if (!movieTitle) return;
        setYtsSearching(true);
        setYtsError('');
        setYtsMovies([]);
        setSelectedYtsMovie(null);
        setSelectedTorrent(null);
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

    const handleConfirmDownloadDir = () => {
        if (!downloadDir.trim()) return;
        saveDownloadDir(downloadDir.trim());
        setShowDirPrompt(false);
    };

    const handleUseDefaultDir = async () => {
        // Always derive from the raw system Downloads dir so we never
        // double-append "Absolute Cinema" if the user already had it saved.
        let base = '';
        if (isTauri) {
            try { base = await getDefaultDownloadDir(); } catch { base = ''; }
        }
        const sep = base.includes('\\') ? '\\' : '/';
        const defaultDir = `${base}${sep}Absolute Cinema`;
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

    const startDownload = async (magnet: string) => {
        setDownloadError('');
        setIsStartingDl(true);
        try {
            const movieDlDir = buildMovieDownloadDir(downloadDir, movieTitle);
            const id = await addMagnet(magnet, movieDlDir);
            setActiveTorrentId(id);
            setMagnetLink(magnet);
        } catch (err: any) {
            setDownloadError(err?.message || 'Failed to start download');
        } finally {
            setIsStartingDl(false);
        }
    };

    const handleConfirmYtsDownload = () => {
        if (!selectedYtsMovie || !selectedTorrent) return;
        const magnet = buildMagnetLink(selectedTorrent.hash, selectedYtsMovie.title_long || selectedYtsMovie.title);
        startDownload(magnet);
    };

    const handleManualMagnetDownload = () => {
        if (!manualMagnet.trim().startsWith('magnet:')) {
            setDownloadError('Please enter a valid magnet link');
            return;
        }
        startDownload(manualMagnet.trim());
    };

    const handleSelectMovie = (movie: TMDBMovie) => {
        setMovieTitle(movie.title);
        setTmdbId(movie.id);
        setMoviePoster(movie.poster_path);
        setName(`${movie.title} Room`);
        setShowSuggestions(false);
        setMovieSelected(true);
        // Reset YTS results so they re-search for the new title
        setYtsMovies([]);
        setSelectedYtsMovie(null);
        setSelectedTorrent(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) { navigate('/login'); return; }
        setError('');
        setIsLoading(true);

        try {
            let finalFileName: string;
            let finalLocalPath: string | undefined;
            let finalMagnetLink: string | undefined;
            let finalLocalFileSource: 'downloaded' | 'manual' | undefined;

            if (sourceTab === 'youtube') {
                if (!youtubeUrl) { setError('Please enter a YouTube URL'); setIsLoading(false); return; }
                finalFileName = youtubeUrl;
                finalLocalPath = youtubeUrl;
            } else {
                finalFileName = `${movieFileName}${mediaType}`;
                finalLocalPath = selectedFilePath || undefined;
                if (localSubTab === 'download' && magnetLink) {
                    finalMagnetLink = magnetLink;
                    finalLocalFileSource = 'downloaded';
                } else if (localSubTab === 'choose-file' && selectedFilePath) {
                    finalLocalFileSource = 'manual';
                }
            }

            const roomId = await createRoomMutation({
                token,
                name,
                movieTitle,
                movieFileName: finalFileName,
                tmdbId,
                moviePoster,
                isPublic: true,
                everyoneCanControl,
                localFilePath: finalLocalPath,
                magnetLink: finalMagnetLink,
                localFileSource: finalLocalFileSource,
            });

            // Save pre-screen data so the admin auto-loads when entering the room
            if (finalLocalPath && finalLocalPath !== youtubeUrl) {
                savePreScreenData(roomId as string, {
                    filePath: finalLocalPath,
                    subtitlePath: detectedSubtitle ?? undefined,
                });
            }

            navigate(`/room/${roomId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create room');
        } finally {
            setIsLoading(false);
        }
    };

    const tabStyle = (tab: SourceTab): React.CSSProperties => ({
        flex: 1, padding: '10px 16px', border: 'none',
        background: sourceTab === tab ? 'var(--primary)' : 'var(--bg-tertiary)',
        color: sourceTab === tab ? '#fff' : 'var(--text-muted)',
        cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
        transition: 'all 0.2s ease',
        borderRadius: tab === 'youtube' ? '8px 0 0 8px' : '0 8px 8px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    });

    const subTabStyle = (tab: LocalSubTab): React.CSSProperties => ({
        flex: 1, padding: '8px 12px', border: 'none',
        background: localSubTab === tab ? 'rgba(var(--primary-rgb, 255,255,255), 0.15)' : 'transparent',
        color: localSubTab === tab ? 'var(--primary)' : 'var(--text-muted)',
        cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
        transition: 'all 0.2s ease', borderRadius: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    });

    const isDownloading = activeTorrentId !== null;
    const isComplete = dlProgress && dlProgress.progress_pct >= 100;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                <div className="modal-header">
                    <h2 className="modal-title">Create a Room</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleSubmit}>
                        {/* Movie title search — lives OUTSIDE the overflow container
                            so the suggestion dropdown is never clipped */}
                        <div className="input-group" style={{ position: 'relative' }}>
                            <label htmlFor="movieTitle">Movie Title</label>
                            <input
                                type="text" id="movieTitle" className="input"
                                placeholder="Search for a movie..."
                                value={movieTitle}
                                onChange={(e) => setMovieTitle(e.target.value)}
                                onFocus={() => movieTitle.length >= 2 && setShowSuggestions(true)}
                                required autoComplete="off"
                            />
                            {showSuggestions && (suggestions.length > 0 || (customMovieResults && customMovieResults.length > 0) || movieTitle.length >= 2) && (
                                <div ref={suggestionRef} className="dropdown-suggestions" style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                    borderRadius: '8px', marginTop: '4px', zIndex: 1000,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)', maxHeight: '280px', overflowY: 'auto'
                                }}>
                                    {customMovieResults && customMovieResults.length > 0 && (
                                        <>
                                            <div style={{ padding: '6px 16px', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom Movies</div>
                                            {customMovieResults.map((movie) => (
                                                <div key={movie._id} className="suggestion-item" style={{ padding: '10px 16px', cursor: 'pointer', transition: 'background 0.2s', borderBottom: '1px solid var(--border)' }}
                                                    onClick={() => { setMovieTitle(movie.title); setTmdbId(undefined); setMoviePoster(movie.poster || undefined); setName(`${movie.title} Room`); setShowSuggestions(false); setMovieSelected(true); setYtsMovies([]); setSelectedYtsMovie(null); setSelectedTorrent(null); }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontWeight: 500 }}>{movie.title}</div>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--primary)', background: 'rgba(var(--primary-rgb, 255,255,255), 0.1)', padding: '1px 6px', borderRadius: '4px' }}>Custom</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{movie.year || 'N/A'}{movie.imdbScore !== undefined ? ` · IMDb ${movie.imdbScore}` : ''}</div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {suggestions.length > 0 && (
                                        <>
                                            {customMovieResults && customMovieResults.length > 0 && (
                                                <div style={{ padding: '6px 16px', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From TMDB</div>
                                            )}
                                            {suggestions.map((movie) => (
                                                <div key={movie.id} className="suggestion-item" style={{ padding: '10px 16px', cursor: 'pointer', transition: 'background 0.2s', borderBottom: '1px solid var(--border)' }}
                                                    onClick={() => handleSelectMovie(movie)}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <div style={{ fontWeight: 500 }}>{movie.title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{movie.release_date ? movie.release_date.split('-')[0] : 'N/A'}</div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    <div style={{ padding: '10px 16px', cursor: 'pointer', transition: 'background 0.2s', color: 'var(--primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onClick={() => { setShowSuggestions(false); setShowAddCustomMovie(true); }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >+ Add "{movieTitle}" as custom movie</div>
                                </div>
                            )}
                        </div>

                        {/* Room config — only shown after a movie is picked */}
                        {movieSelected && (
                        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: '20px' }}>

                        {error && (
                            <div className="toast error" style={{ position: 'static' }}>{error}</div>
                        )}

                        {/* Room name */}
                        <div className="input-group">
                            <label htmlFor="roomName">Room Name</label>
                            <input type="text" id="roomName" className="input" placeholder="e.g., Movie Night with Friends" value={name} onChange={(e) => setName(e.target.value)} required />
                        </div>

                        {/* Source tab selector */}
                        <div className="input-group">
                            <label>Video Source</label>
                            <div style={{ display: 'flex', marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <button type="button" style={tabStyle('youtube')} onClick={() => setSourceTab('youtube')}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                                    YouTube URL
                                </button>
                                <button type="button" style={tabStyle('local')} onClick={() => setSourceTab('local')}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                                    Local File
                                </button>
                            </div>

                            {/* YouTube content */}
                            {sourceTab === 'youtube' && (
                                <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                    <input type="text" className="input" placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>Paste a YouTube video link. All viewers will stream the video directly.</span>
                                </div>
                            )}

                            {/* Local file content */}
                            {sourceTab === 'local' && (
                                <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                    {/* Sub-tabs: Choose File / Download */}
                                    <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', padding: '4px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                        <button type="button" style={subTabStyle('choose-file')} onClick={() => setLocalSubTab('choose-file')}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                                            Choose File
                                        </button>
                                        <button type="button" style={subTabStyle('download')} onClick={() => setLocalSubTab('download')}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                            Download Movie
                                        </button>
                                    </div>

                                    {/* Choose File sub-tab */}
                                    {localSubTab === 'choose-file' && (
                                        <>
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                                <button type="button" className="btn btn-secondary" onClick={async () => {
                                                    try {
                                                        const selected = await open({ multiple: false, filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'webm', 'mov'] }] });
                                                        if (selected) {
                                                            const filePath = typeof selected === 'string' ? selected : (selected as any).path || String(selected);
                                                            setSelectedFilePath(filePath);
                                                            const parts = filePath.split(/[\\/]/);
                                                            const fullFileName = parts[parts.length - 1];
                                                            const lastDotIndex = fullFileName.lastIndexOf('.');
                                                            if (lastDotIndex !== -1) {
                                                                setMovieFileName(fullFileName.substring(0, lastDotIndex));
                                                                const extPart = fullFileName.substring(lastDotIndex);
                                                                if (mediaTypes.includes(extPart)) setMediaType(extPart);
                                                            } else {
                                                                setMovieFileName(fullFileName);
                                                            }
                                                        }
                                                    } catch { /* ignore */ }
                                                }} style={{ flexShrink: 0 }}>
                                                    {selectedFilePath ? '📁 Change File' : '📁 Select Movie File'}
                                                </button>
                                                {selectedFilePath && (
                                                    <div style={{ flex: 1, padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid var(--border)' }}>
                                                        {selectedFilePath}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input type="text" className="input" style={{ flex: 1 }} placeholder="e.g., Inception.2010.1080p" value={movieFileName} onChange={(e) => setMovieFileName(e.target.value)} />
                                                <select className="input" style={{ width: '100px', cursor: 'pointer' }} value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
                                                    {mediaTypes.map(type => <option key={type} value={type}>{type}</option>)}
                                                </select>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                                                {selectedFilePath ? 'File name and type extracted from selected file. You can adjust them if needed.' : 'Select a local video file or enter the filename manually. All viewers need the same file.'}
                                            </span>
                                        </>
                                    )}

                                    {/* Download sub-tab */}
                                    {localSubTab === 'download' && (
                                        <div>
                                            {/* Download dir prompt */}
                                            {showDirPrompt && (
                                                <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontWeight: 600, marginBottom: '8px' }}>Choose your download folder</div>
                                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                        <input className="input" style={{ flex: 1, fontSize: '0.85rem' }} value={downloadDir} onChange={(e) => setDownloadDir(e.target.value)} placeholder="Download folder path..." />
                                                        {isTauri && <button type="button" className="btn btn-secondary" onClick={handleBrowseDir} style={{ flexShrink: 0 }}>Browse</button>}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button type="button" className="btn btn-primary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={handleUseDefaultDir}>
                                                            Use default ("Absolute Cinema" in Downloads)
                                                        </button>
                                                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleConfirmDownloadDir}>
                                                            Use this folder
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {!isTauri && (
                                                <div style={{ color: 'var(--warning)', fontSize: '0.85rem', padding: '8px 12px', background: 'rgba(245, 166, 35, 0.1)', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                                                    ⚠ Torrent downloads require the desktop app.
                                                </div>
                                            )}

                                            {/* Download dir display */}
                                            {!showDirPrompt && downloadDir && !isDownloading && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>Save to:</span>
                                                    <span style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{buildMovieDownloadDir(downloadDir, movieTitle || 'Movie')}</span>
                                                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '2px 8px', flexShrink: 0 }} onClick={() => setShowDirPrompt(true)}>Change</button>
                                                </div>
                                            )}

                                            {/* YTS search phase */}
                                            {!isDownloading && !showDirPrompt && (
                                                <>
                                                    {ytsSearching && (
                                                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                                            <div className="spinner" style={{ width: '28px', height: '28px', margin: '0 auto 8px' }} />
                                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Searching YTS...</p>
                                                        </div>
                                                    )}

                                                    {!ytsSearching && !showManualMagnet && (
                                                        <>
                                                            {ytsError || ytsMovies.length === 0 ? (
                                                                ytsMovies.length === 0 && !ytsError ? null : (
                                                                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                                                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '10px' }}>{ytsError ? 'YTS search failed' : 'No results found'}</p>
                                                                        {ytsError && <p style={{ color: '#e50914', fontSize: '0.78rem', marginBottom: '10px', fontFamily: 'monospace' }}>{ytsError}</p>}
                                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                                            <button type="button" className="btn btn-secondary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={runYtsSearch}>Retry</button>
                                                                            <button type="button" className="btn btn-secondary" style={{ flex: 1, fontSize: '0.85rem' }} onClick={() => setShowManualMagnet(true)}>Enter magnet manually</button>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            ) : (
                                                                <>
                                                                    {/* Movie selection */}
                                                                    {!selectedYtsMovie && ytsMovies.length > 0 && (
                                                                        <div>
                                                                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Select movie:</p>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                                {ytsMovies.map((movie) => (
                                                                                    <button key={movie.id} type="button" className="torrent-item" onClick={() => setSelectedYtsMovie(movie)} style={{ cursor: 'pointer', textAlign: 'left', border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)' }}>
                                                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                                                            <img src={movie.small_cover_image ?? undefined} alt="" style={{ width: '36px', height: '54px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { (e.target as any).style.display = 'none'; }} />
                                                                                            <div style={{ flex: 1 }}>
                                                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{movie.title}</div>
                                                                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{movie.year} · {movie.torrents?.length || 0} qualities</div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Quality selection */}
                                                                    {selectedYtsMovie && !selectedTorrent && (
                                                                        <div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                                                                <img src={selectedYtsMovie.medium_cover_image ?? undefined} alt="" style={{ width: '44px', height: '66px', borderRadius: '4px', objectFit: 'cover' }} onError={(e) => { (e.target as any).style.display = 'none'; }} />
                                                                                <div>
                                                                                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedYtsMovie.title}</div>
                                                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedYtsMovie.year}</div>
                                                                                </div>
                                                                                {ytsMovies.length > 1 && <button type="button" className="btn btn-ghost" onClick={() => setSelectedYtsMovie(null)} style={{ marginLeft: 'auto', fontSize: '0.78rem', padding: '3px 8px' }}>Change</button>}
                                                                            </div>
                                                                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Choose quality:</p>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                                {(selectedYtsMovie.torrents || []).map((torrent, i) => {
                                                                                    const qualColor = getQualityColor(torrent.quality);
                                                                                    return (
                                                                                        <button key={i} type="button" className="yts-torrent-option" onClick={() => setSelectedTorrent(torrent)}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                                                                                                <div style={{ background: `${qualColor}22`, border: `1px solid ${qualColor}44`, color: qualColor, padding: '4px 12px', borderRadius: '6px', fontWeight: 700, fontSize: '0.9rem', minWidth: '70px', textAlign: 'center' }}>{torrent.quality}</div>
                                                                                                <div style={{ flex: 1, textAlign: 'left' }}>
                                                                                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{getQualityLabel(torrent.quality)}{torrent.torrent_type && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px', fontSize: '0.78rem' }}>{torrent.torrent_type.toUpperCase()}</span>}</div>
                                                                                                    <div style={{ display: 'flex', gap: '10px', marginTop: '2px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                                                                        <span>📦 {torrent.size ?? '?'}</span>
                                                                                                        <span style={{ color: '#46d369' }}>▲ {torrent.seeds ?? 0}</span>
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
                                                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedYtsMovie.title}</div>
                                                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedTorrent.size ?? '?'} · {selectedTorrent.seeds ?? 0} seeds</div>
                                                                                </div>
                                                                                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTorrent(null)} style={{ fontSize: '0.78rem', padding: '3px 8px' }}>Change</button>
                                                                            </div>
                                                                            {downloadError && <div style={{ color: '#e50914', fontSize: '0.82rem', padding: '6px 10px', background: 'rgba(229,9,20,0.1)', borderRadius: '6px', marginBottom: '8px' }}>{downloadError}</div>}
                                                                            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleConfirmYtsDownload} disabled={isStartingDl || !isTauri}>
                                                                                {isStartingDl ? <><div className="spinner" style={{ width: '14px', height: '14px' }} /> Starting...</> : `⬇ Download ${selectedTorrent.quality}`}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* Manual magnet input */}
                                                    {!ytsSearching && showManualMagnet && (
                                                        <div>
                                                            <div className="input-group">
                                                                <label style={{ fontSize: '0.85rem' }}>Magnet Link</label>
                                                                <textarea className="input" placeholder="magnet:?xt=urn:btih:..." value={manualMagnet} onChange={(e) => setManualMagnet(e.target.value)} style={{ minHeight: '70px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }} />
                                                            </div>
                                                            {downloadError && <div style={{ color: '#e50914', fontSize: '0.82rem', padding: '6px 10px', background: 'rgba(229,9,20,0.1)', borderRadius: '6px', marginBottom: '8px' }}>{downloadError}</div>}
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button type="button" className="btn btn-ghost" onClick={() => { setShowManualMagnet(false); setDownloadError(''); }} style={{ fontSize: '0.82rem' }}>← Back</button>
                                                                <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleManualMagnetDownload} disabled={isStartingDl || !isTauri}>
                                                                    {isStartingDl ? 'Starting...' : '⬇ Start Download'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Download in progress */}
                                            {isDownloading && (
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }}>
                                                            {dlProgress?.name || 'Resolving...'}
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
                                                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            <span>{formatBytes(dlProgress.downloaded_bytes)} / {formatBytes(dlProgress.total_bytes)}</span>
                                                            <span style={{ color: '#46d369' }}>↓ {dlProgress.download_speed.toFixed(1)} MB/s</span>
                                                        </div>
                                                    )}
                                                    {isComplete && selectedFilePath && (
                                                        <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(70, 211, 105, 0.1)', border: '1px solid rgba(70, 211, 105, 0.3)', borderRadius: '8px' }}>
                                                            <div style={{ color: '#46d369', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>✓ File ready</div>
                                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFilePath}</div>
                                                            {detectedSubtitle && (
                                                                <div style={{ fontSize: '0.78rem', color: '#46d369', marginTop: '4px' }}>Subtitle detected: {detectedSubtitle.split(/[\\/]/).pop()}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Shared playback control toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label style={{ fontWeight: 500 }}>Shared Playback Control</label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Allow all viewers to play, pause, and seek the video</p>
                            </div>
                            <div className={`toggle ${everyoneCanControl ? 'active' : ''}`} onClick={() => setEveryoneCanControl(!everyoneCanControl)} />
                        </div>

                        </div>)} {/* end movieSelected */}

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={!movieSelected || isLoading || (sourceTab === 'local' && localSubTab === 'download' && isDownloading && !isComplete)}>
                            {isLoading ? <span className="spinner" /> : (
                                <>
                                    <img src={logo} alt="" style={{ height: '1.2em', marginRight: '8px', verticalAlign: 'middle' }} />
                                    {sourceTab === 'local' && localSubTab === 'download' && isDownloading && !isComplete ? 'Downloading...' : 'Create Room'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {showAddCustomMovie && (
                <AddCustomMovieModal
                    initialTitle={movieTitle}
                    onClose={() => setShowAddCustomMovie(false)}
                    onMovieAdded={() => setShowAddCustomMovie(false)}
                />
            )}
        </div>
    );
}
