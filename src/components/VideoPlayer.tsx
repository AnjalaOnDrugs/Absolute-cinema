import { forwardRef, useEffect, useRef, useState, useCallback, useImperativeHandle } from 'react';
import ReactPlayer from 'react-player';
import { getImageUrl } from '../lib/tmdb';
import settingsLogo from '../assets/settings_logo.png';
import ccLogo from '../assets/cc_logo.png';

interface VideoPlayerProps {
    src: string | null;
    poster?: string;
    subtitleUrl?: string | null;
    subtitleLabel?: string;
    // Pass-through event handlers
    onPlay?: () => void;
    onPause?: () => void;
    onSeeked?: () => void;
    onTimeUpdate?: () => void;
    movieTitle?: string;
    onSubtitleClick?: () => void;
    // Action notification
    actionNotification?: string | null;
    actionNotificationProfile?: string;
    actionNotificationDisplayName?: string;
    actionNotificationUserId?: string;
    actionNotificationIsPause?: boolean;
    onUserClick?: (userId: string) => void;
    // Codec error callback
    onCodecError?: () => void;
    onFixIssues?: () => void;
}

export const VideoPlayer = forwardRef<any, VideoPlayerProps>(({
    src,
    poster,
    subtitleUrl,
    subtitleLabel,
    onPlay,
    onPause,
    onSeeked,
    onTimeUpdate,
    movieTitle,
    onSubtitleClick,
    actionNotification,
    actionNotificationProfile,
    actionNotificationDisplayName,
    actionNotificationUserId,
    actionNotificationIsPause,
    onUserClick,
    onCodecError,
    onFixIssues
}, ref) => {
    // Internal state for UI
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isHovering, setIsHovering] = useState(false);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const Player = ReactPlayer as any;

    const [ytError, setYtError] = useState<boolean>(false);
    const isTauri = !!(window as any).__TAURI_INTERNALS__;

    useEffect(() => {
        setYtError(false);
    }, [src]);

    const handleOpenInBrowser = useCallback(async () => {
        if (!src) return;
        if (isTauri) {
            try {
                const { openUrl } = await import('@tauri-apps/plugin-opener');
                await openUrl(src);
            } catch (err) {
                console.error("Failed to open URL in browser via Tauri opener:", err);
                window.open(src, '_blank');
            }
        } else {
            window.open(src, '_blank');
        }
    }, [src, isTauri]);

    // Determine source type early — used by hover preview, refs, and controls
    const isYoutube = src ? /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/.test(src) : false;

    // Timeline Hover State
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverPos, setHoverPos] = useState<number>(0);
    const previewVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!isYoutube && previewVideoRef.current && hoverTime !== null && isFinite(hoverTime)) {
            previewVideoRef.current.currentTime = hoverTime;
        }
    }, [hoverTime, isYoutube]);

    // YouTube thumbnail preview — uses static thumbnails (1.jpg, 2.jpg, 3.jpg)
    const ytVideoId = isYoutube && src ? getYouTubeVideoId(src) : null;
    const ytPreviewThumb = ytVideoId && hoverTime !== null && duration > 0
        ? getYtPreviewThumbnail(ytVideoId, hoverTime, duration)
        : ytVideoId
            ? `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`
            : null;

    const htmlVideoRef = useRef<HTMLVideoElement>(null);
    const reactPlayerRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
        get currentTime() {
            if (isYoutube && reactPlayerRef.current) return reactPlayerRef.current.currentTime || 0;
            if (htmlVideoRef.current) return htmlVideoRef.current.currentTime;
            return currentTime;
        },
        set currentTime(time: number) {
            if (isYoutube && reactPlayerRef.current) {
                reactPlayerRef.current.currentTime = time;
                setCurrentTime(time);
            } else if (htmlVideoRef.current) {
                htmlVideoRef.current.currentTime = time;
                setCurrentTime(time);
            }
        },
        get paused() {
            if (isYoutube) return !isPlaying;
            if (htmlVideoRef.current) return htmlVideoRef.current.paused;
            return true;
        },
        get playbackRate() {
            if (isYoutube && reactPlayerRef.current) return reactPlayerRef.current.playbackRate || 1;
            if (htmlVideoRef.current) return htmlVideoRef.current.playbackRate;
            return 1;
        },
        set playbackRate(rate: number) {
            if (isYoutube && reactPlayerRef.current) {
                reactPlayerRef.current.playbackRate = rate;
            } else if (htmlVideoRef.current) {
                htmlVideoRef.current.playbackRate = rate;
            }
        },
        play: async () => {
            if (isYoutube) {
                setIsPlaying(true);
                if (onPlay) onPlay();
            } else if (htmlVideoRef.current) {
                await htmlVideoRef.current.play();
            }
        },
        pause: () => {
            if (isYoutube) {
                setIsPlaying(false);
                if (onPause) onPause();
            } else if (htmlVideoRef.current) {
                htmlVideoRef.current.pause();
            }
        }
    }));

    // Fallback for native DOM elements that are queried internally within VideoPlayer
    const internalVideoRef = htmlVideoRef;

    const formatTime = (time: number) => {
        if (!isFinite(time)) return "0:00";
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const seconds = Math.floor(time % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Handle Idle State (Hide controls)
    useEffect(() => {
        const handleMouseMove = () => {
            setShowControls(true);
            document.body.style.cursor = 'default';

            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }

            // Only hide if playing and fullscreen or just playing?
            // User requested cursor visibility "unless I pause".
            // Actually user complained "cursor is not visible... unless I pause".
            // So we should hide it when playing after inactivity, but definitely SHOW it on move.

            if (isPlaying) {
                controlsTimeoutRef.current = setTimeout(() => {
                    if (isFullscreen) {
                        setShowControls(false);
                        // Optional: hide cursor in fullscreen for immersion
                        // document.body.style.cursor = 'none'; 
                        // BUT user specifically had issues with cursor disappearing. 
                        // I will keep cursor visible for now to be safe, or only hide if strictly requested.
                        // Let's hide controls but keep cursor 'default' but maybe over video it can be none?
                        // Standard behavior: hide cursor over video.
                        // Let's implement standard behavior:
                        if (containerRef.current?.matches(':hover')) {
                            // If hovering video container, hide cursor
                            // But for now, let's just leave cursor visible to solving the user's primary complaint 100%.
                        }
                    }
                }, 3000);
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('mousemove', handleMouseMove);
            container.addEventListener('mouseleave', () => {
                if (isPlaying) setShowControls(false);
            });
        }

        return () => {
            if (container) {
                container.removeEventListener('mousemove', handleMouseMove);
            }
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            document.body.style.cursor = 'default';
        };
    }, [isPlaying, isFullscreen]);

    // YouTube-specific controls
    const YT_QUALITIES = [
        { value: 'default', label: 'Auto' },
        { value: 'hd2160', label: '4K' },
        { value: 'hd1440', label: '1440p' },
        { value: 'hd1080', label: '1080p HD' },
        { value: 'hd720', label: '720p HD' },
        { value: 'large', label: '480p' },
        { value: 'medium', label: '360p' },
        { value: 'small', label: '240p' },
    ];
    const [ytQuality, setYtQuality] = useState('default');
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const [ytCCEnabled, setYtCCEnabled] = useState(false);

    const [ytAvailableQualities, setYtAvailableQualities] = useState<string[]>([]);

    const handleYtQuality = (quality: string) => {
        setYtQuality(quality);
        setShowQualityMenu(false);
        // Access the internal YT IFrame API via youtube-video-element's .api property
        const ytApi = (reactPlayerRef.current as any)?.api;
        if (ytApi?.setPlaybackQuality) {
            ytApi.setPlaybackQuality(quality);
        }
    };

    const toggleYtCC = () => {
        // Access the internal YT IFrame API via youtube-video-element's .api property
        const ytApi = (reactPlayerRef.current as any)?.api;
        if (ytApi) {
            if (ytCCEnabled) {
                // Turn off captions by setting an empty track
                ytApi.setOption?.('captions', 'track', {});
            } else {
                // Turn on captions - get available caption tracks and enable the first one
                const tracklist = ytApi.getOption?.('captions', 'tracklist') || [];
                if (tracklist.length > 0) {
                    ytApi.setOption?.('captions', 'track', { languageCode: tracklist[0].languageCode });
                } else {
                    // Fallback: try loading with auto-generated captions
                    ytApi.loadModule?.('captions');
                }
            }
            setYtCCEnabled(prev => !prev);
        }
    };

    // Subtitle State
    const [cues, setCues] = useState<{ start: number; end: number; text: string }[]>([]);
    const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
    const [isSubtitleVisible, setIsSubtitleVisible] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [subtitleSettings, setSubtitleSettings] = useState({
        fontSize: 1.5, // rem
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.5)',
        textShadow: '0 2px 4px rgba(0,0,0,0.8)'
    });

    useEffect(() => {
        if (!subtitleUrl) {
            setCues([]);
            setActiveSubtitle(null);
            return;
        }

        const parseSubtitles = async () => {
            try {
                const response = await fetch(subtitleUrl);
                const text = await response.text();

                // Simple VTT Parser
                const lines = text.split(/\r?\n/);
                const parsedCues: { start: number; end: number; text: string }[] = [];
                let i = 0;

                // Skip header 'WEBVTT'
                while (i < lines.length && !lines[i].includes('-->')) {
                    i++;
                }

                while (i < lines.length) {
                    const line = lines[i];
                    if (line.includes('-->')) {
                        const [startParts, endParts] = line.split(' --> ');
                        if (startParts && endParts) {
                            const start = parseVttTimestamp(startParts.trim());
                            const end = parseVttTimestamp(endParts.trim());

                            let textBuffer = '';
                            i++;
                            while (i < lines.length && lines[i].trim() !== '') {
                                textBuffer += lines[i] + ' ';
                                i++;
                            }

                            parsedCues.push({ start, end, text: textBuffer.trim() });
                        }
                    }
                    i++;
                }
                setCues(parsedCues);
            } catch (err) {
                console.error("Failed to parse subtitles:", err);
            }
        };

        parseSubtitles();
    }, [subtitleUrl]);

    // Video Event Listeners
    useEffect(() => {
        const video = internalVideoRef?.current;
        if (!video) return;

        const updateState = () => {
            const time = video.currentTime;
            setCurrentTime(time);
            setDuration(video.duration);
            setIsPlaying(!video.paused);
            setVolume(video.volume);
            setIsMuted(video.muted);

            // Update Subtitle
            const active = cues.find(c => time >= c.start && time <= c.end);
            setActiveSubtitle(active ? active.text : null);
        };

        if (isYoutube) return;
        video.addEventListener('timeupdate', updateState);
        video.addEventListener('play', () => { updateState(); if (onPlay) onPlay(); });
        video.addEventListener('pause', () => { updateState(); if (onPause) onPause(); });
        video.addEventListener('loadedmetadata', updateState);
        video.addEventListener('volumechange', updateState);

        // Detect codec errors - video has 0 dimensions but has audio tracks
        const handleLoadedData = () => {
            // Check if video has no video tracks (audio only due to codec issue)
            if (video.videoWidth === 0 && video.videoHeight === 0) {
                console.warn('Video has no video dimensions - possible codec issue');
                if (onCodecError) {
                    onCodecError();
                }
            }
        };

        const handleError = () => {
            const error = video.error;
            if (error) {
                console.error('Video error:', error.code, error.message);
                // MEDIA_ERR_SRC_NOT_SUPPORTED or decode errors
                if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ||
                    error.code === MediaError.MEDIA_ERR_DECODE) {
                    if (onCodecError) {
                        onCodecError();
                    }
                }
            }
        };

        video.addEventListener('loadeddata', handleLoadedData);
        video.addEventListener('error', handleError);
        video.addEventListener('seeked', () => { if (onSeeked) onSeeked(); });

        return () => {
            video.removeEventListener('timeupdate', updateState);
            video.removeEventListener('play', updateState);
            video.removeEventListener('pause', updateState);
            video.removeEventListener('loadedmetadata', updateState);
            video.removeEventListener('volumechange', updateState);
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeEventListener('error', handleError);
        };
    }, [internalVideoRef, cues]);

    // Fullscreen Toggle
    const toggleFullscreen = async () => {
        if (!containerRef.current) return;

        if (!document.fullscreenElement) {
            try {
                await containerRef.current.requestFullscreen();
                setIsFullscreen(true);
            } catch (err) {
                console.error("Fullscreen failed:", err);
            }
        } else {
            await document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Listen for fullscreen change (ESC key etc)
    useEffect(() => {
        const handleFSChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFSChange);
        return () => document.removeEventListener('fullscreenchange', handleFSChange);
    }, []);

    const togglePlay = () => {
        if (isYoutube) {
            setIsPlaying((prev) => {
                const newPlaying = !prev;
                if (newPlaying && onPlay) onPlay();
                if (!newPlaying && onPause) onPause();
                return newPlaying;
            });
        } else if (internalVideoRef?.current) {
            if (internalVideoRef.current.paused) {
                internalVideoRef.current.play();
            } else {
                internalVideoRef.current.pause();
            }
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (isYoutube && reactPlayerRef.current) {
            reactPlayerRef.current.currentTime = time;
            setCurrentTime(time);
            if (onSeeked) onSeeked();
        } else if (internalVideoRef?.current) {
            internalVideoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = parseFloat(e.target.value);
        setVolume(vol);
        setIsMuted(vol === 0);
        if (!isYoutube && internalVideoRef?.current) {
            internalVideoRef.current.volume = vol;
            internalVideoRef.current.muted = vol === 0;
        }
    };

    const toggleMute = () => {
        if (isYoutube) {
            setIsMuted(prev => !prev);
        } else if (internalVideoRef?.current) {
            internalVideoRef.current.muted = !internalVideoRef.current.muted;
            setIsMuted(internalVideoRef.current.muted);
        }
    };

    const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const time = percentage * (duration || 0);

        setHoverTime(time);
        setHoverPos(x);
    };

    const handleProgressLeave = () => {
        setHoverTime(null);
    };

    return (
        <div
            ref={containerRef}
            className={`custom-player ${isFullscreen ? 'fullscreen' : ''}`}
            onDoubleClick={toggleFullscreen}
        >
            {/* ... video ... */}
            {isYoutube ? (
                <div className="custom-player-video" onClick={ytError ? undefined : togglePlay}>
                    {ytError ? (
                        <div className="yt-fallback-container" onClick={(e) => e.stopPropagation()}>
                            <div className="yt-fallback-card">
                                <div className="yt-fallback-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                </div>
                                <h3 className="yt-fallback-title">Playback Restricted</h3>
                                <p className="yt-fallback-message">
                                    This YouTube video cannot be played directly inside the app.
                                    This is usually due to age restrictions or embedding limitations set by the owner.
                                </p>
                                <div className="yt-fallback-actions">
                                    <button className="yt-fallback-btn yt-fallback-btn-primary" onClick={handleOpenInBrowser}>
                                        <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                            <polyline points="15 3 21 3 21 9"/>
                                            <line x1="10" y1="14" x2="21" y2="3"/>
                                        </svg>
                                        Open in Browser
                                    </button>
                                    {onFixIssues && (
                                        <button className="yt-fallback-btn yt-fallback-btn-secondary" onClick={onFixIssues}>
                                            <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px' }} fill="currentColor">
                                                <path d="M17.485 17.512l1.631 3.488H4.884l1.631-3.488H17.485zM11.973 1.012c.119 0 .237.015.351.045l1.696 4.607h-4.093l1.696-4.607c.113-.03.231-.045.35-.045zm3.179 10.0h3.18l1.631 3.5h-11.232l1.631-3.5h3.179l-1.611-4.38h4.834l-1.612 4.38zm-6.358 0h3.179l1.612-4.38H5.614l1.612 4.38h3.179z"/>
                                            </svg>
                                            Open in VLC
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
                            <Player
                                ref={reactPlayerRef}
                                src={src || undefined}
                                width="100%"
                                height="100%"
                                playing={isPlaying}
                                volume={isMuted ? 0 : volume}
                                onError={() => {
                                    console.warn('YouTube error caught by ReactPlayer');
                                    setYtError(true);
                                }}
                                onTimeUpdate={(e: any) => {
                                    if (reactPlayerRef.current) {
                                        const time = reactPlayerRef.current.currentTime;
                                        setCurrentTime(time);
                                        // Update subtitle cue for YouTube videos
                                        if (cues.length > 0) {
                                            const active = cues.find(c => time >= c.start && time <= c.end);
                                            setActiveSubtitle(active ? active.text : null);
                                        }
                                    }
                                    if (onTimeUpdate) onTimeUpdate();
                                }}
                                onDurationChange={(e: any) => {
                                    const d = e?.currentTarget?.duration || reactPlayerRef.current?.duration;
                                    if (d) setDuration(d);
                                }}
                                onPlay={() => {
                                    setIsPlaying(true);
                                    if (onPlay) onPlay();
                                    // Fetch available quality levels when video starts playing
                                    try {
                                        const ytApi = (reactPlayerRef.current as any)?.api;
                                        if (ytApi?.getAvailableQualityLevels) {
                                            const levels = ytApi.getAvailableQualityLevels();
                                            if (levels && levels.length > 0) {
                                                setYtAvailableQualities(levels);
                                            }
                                        }
                                    } catch (e) { /* ignore */ }
                                }}
                                onPause={() => {
                                    setIsPlaying(false);
                                    if (onPause) onPause();
                                }}
                                onSeeked={() => {
                                    if (onSeeked) onSeeked();
                                }}
                                config={{
                                    youtube: {
                                        controls: 0,
                                        disablekb: 1,
                                        fs: 0,
                                        modestbranding: 1,
                                        rel: 0,
                                        showinfo: 0,
                                        iv_load_policy: 3,
                                        cc_load_policy: 1
                                    } as any
                                }}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <video
                    ref={htmlVideoRef}
                    src={src || undefined}
                    className="custom-player-video"
                    onClick={togglePlay}
                    poster={getImageUrl(poster)}
                    playsInline
                />
            )}

            {/* Custom Overlay Controls */}
            <div className={`custom-player-overlay ${!showControls && isPlaying && !isSettingsOpen ? 'hidden' : ''}`}>

                {/* Top Bar (Title) */}
                <div className="player-top-bar">
                    <h3>{movieTitle}</h3>
                </div>

                {/* Center Play Button (only when valid paused and hovering) */}
                {!isPlaying && (
                    <button className="center-play-btn" onClick={togglePlay}>
                        ▶
                    </button>
                )}

                {/* Settings Modal - (Unchanged) */}
                {isSettingsOpen && (
                    <div className="player-settings-modal" onClick={(e) => e.stopPropagation()}>
                        <h4>Subtitle Appearance</h4>
                        <div className="setting-row">
                            <label>Size</label>
                            <input
                                type="range"
                                min="0.8"
                                max="3"
                                step="0.1"
                                value={subtitleSettings.fontSize}
                                onChange={(e) => setSubtitleSettings({ ...subtitleSettings, fontSize: parseFloat(e.target.value) })}
                            />
                        </div>
                        <div className="setting-row">
                            <label>Color</label>
                            <input
                                type="color"
                                value={subtitleSettings.color}
                                onChange={(e) => setSubtitleSettings({ ...subtitleSettings, color: e.target.value })}
                            />
                        </div>
                        <div className="setting-row">
                            <label>Background</label>
                            <div className="bg-options">
                                <button
                                    className={subtitleSettings.backgroundColor === 'rgba(0,0,0,0.5)' ? 'active' : ''}
                                    onClick={() => setSubtitleSettings({ ...subtitleSettings, backgroundColor: 'rgba(0,0,0,0.5)' })}
                                >Black</button>
                                <button
                                    className={subtitleSettings.backgroundColor === 'transparent' ? 'active' : ''}
                                    onClick={() => setSubtitleSettings({ ...subtitleSettings, backgroundColor: 'transparent' })}
                                >None</button>
                            </div>
                        </div>
                        <button className="close-settings-btn" onClick={() => setIsSettingsOpen(false)}>Close</button>
                    </div>
                )}


                {/* Bottom Controls */}
                <div className="player-controls-wrapper">
                    {/* Progress Bar */}
                    <div
                        className="player-progress-container"
                        onMouseMove={handleProgressHover}
                        onMouseLeave={handleProgressLeave}
                    >
                        <div
                            className="timeline-tooltip"
                            style={{
                                left: `${hoverPos}px`,
                                opacity: hoverTime !== null ? 1 : 0,
                                visibility: hoverTime !== null ? 'visible' : 'hidden',
                            }}
                        >
                            {isYoutube ? (
                                ytPreviewThumb && (
                                    <img
                                        className="preview-video"
                                        src={ytPreviewThumb}
                                        alt="Preview"
                                        style={{ display: 'block' }}
                                    />
                                )
                            ) : (
                                <video
                                    ref={previewVideoRef}
                                    src={src || undefined}
                                    className="preview-video"
                                    muted
                                    preload="auto"
                                    style={{ display: 'block' }}
                                />
                            )}
                            <span className="timeline-time-text">{formatTime(hoverTime || 0)}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max={duration || 100}
                            value={currentTime}
                            onChange={handleSeek}
                            className="player-progress"
                            style={{ backgroundSize: `${(currentTime / duration) * 100}% 100%` }}
                        />
                    </div>

                    <div className="player-controls-row">
                        {/* ... controls ... */}
                        <div className="player-controls-left">
                            <button className="player-btn" onClick={togglePlay}>
                                {isPlaying ? (
                                    <svg viewBox="0 0 18 18"><path d="M6 1H3c-.6 0-1 .4-1 1v14c0 .6.4 1 1 1h3c.6 0 1-.4 1-1V2c0-.6-.4-1-1-1zm6 0c-.6 0-1 .4-1 1v14c0 .6.4 1 1 1h3c.6 0 1-.4 1-1V2c0-.6-.4-1-1-1h-3z" /></svg>
                                ) : (
                                    <svg viewBox="0 0 18 18"><path d="M15.562 8.1L3.87.225c-.818-.562-1.87 0-1.87.9v15.75c0 .9 1.052 1.462 1.87.9L15.563 9.9c.584-.45.584-1.35 0-1.8z" /></svg>
                                )}
                            </button>

                            <div className="volume-wrapper group">
                                <button className="player-btn" onClick={toggleMute}>
                                    {isMuted || volume === 0 ? (
                                        <svg viewBox="0 0 18 18"><path d="M12.4 12.5l2.1-2.1 2.1 2.1 1.4-1.4L15.9 9 18 6.9l-1.4-1.4-2.1 2.1-2.1-2.1L11 6.9 13.1 9 11 11.1zM3.786 6.008H.714C.286 6.008 0 6.31 0 6.76v4.512c0 .452.286.752.714.752h3.072l4.071 3.858c.5.3 1.143 0 1.143-.602V2.752c0-.601-.643-.976-1.143-.601L3.786 6.008z" /></svg>
                                    ) : (
                                        <svg viewBox="0 0 18 18"><path d="M15.6 3.3c-.4-.4-1-.4-1.4 0-.4.4-.4 1 0 1.4C15.4 5.9 16 7.4 16 9c0 1.6-.6 3.1-1.8 4.3-.4.4-.4 1 0 1.4.2.2.5.3.7.3.3 0 .5-.1.7-.3C17.1 13.2 18 11.2 18 9s-.9-4.2-2.4-5.7zM13.2 5.6c-.4-.4-1-.4-1.4 0-.4.4-.4 1 0 1.4C12.5 7.9 12.9 8.4 12.9 9s-.4 1.1-1.1 2c-.4.4-.4 1 0 1.4.2.2.5.3.7.3.3 0 .5-.1.7-.3C14.5 11.3 15 10.2 15 9s-.5-2.3-1.8-3.4zM9 2.1l-3.2 3h-4C1.3 5.1 1 5.4 1 5.9v6.2c0 .5.3.8.8.8h4l3.2 3c.4.3.9.1.9-.4V2.5c0-.5-.5-.7-.9-.4z" /></svg>
                                    )}
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={isMuted ? 0 : volume}
                                    onChange={handleVolume}
                                    className="volume-slider"
                                />
                            </div>

                            <span className="player-time">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                        </div>

                        <div className="player-controls-right">
                            {onFixIssues && (
                                <button
                                    className="player-btn vlc-btn"
                                    onClick={onFixIssues}
                                    title="Open in VLC (Supports all codecs)"
                                    style={{
                                        color: '#ff8800',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '0 8px',
                                        width: 'auto',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    <svg viewBox="0 0 24 24" style={{ height: '1.2em' }}><path fill="currentColor" d="M17.485 17.512l1.631 3.488H4.884l1.631-3.488H17.485zM11.973 1.012c.119 0 .237.015.351.045l1.696 4.607h-4.093l1.696-4.607c.113-.03.231-.045.35-.045zm3.179 10.0h3.18l1.631 3.5h-11.232l1.631-3.5h3.179l-1.611-4.38h4.834l-1.612 4.38zm-6.358 0h3.179l1.612-4.38H5.614l1.612 4.38h3.179z" /></svg>
                                    <span style={{ fontWeight: 600 }}>VLC</span>
                                </button>
                            )}

                            {/* YouTube Quality Selector */}
                            {isYoutube && (
                                <div style={{ position: 'relative' }}>
                                    <button
                                        className="player-btn"
                                        onClick={() => setShowQualityMenu(prev => !prev)}
                                        title="Quality"
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px', width: 'auto' }}
                                    >
                                        <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                                            <path fill="currentColor" d="M19.59 7l-7.59 7.59L4.41 7 3 8.41l9 9 9-9z" />
                                        </svg>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.02em' }}>
                                            {YT_QUALITIES.find(q => q.value === ytQuality)?.label ?? 'Auto'}
                                        </span>
                                    </button>
                                    {showQualityMenu && (
                                        <div className="yt-quality-menu">
                                            {YT_QUALITIES
                                                .filter(q => q.value === 'default' || ytAvailableQualities.length === 0 || ytAvailableQualities.includes(q.value))
                                                .map(q => (
                                                    <button
                                                        key={q.value}
                                                        className={`yt-quality-item ${ytQuality === q.value ? 'active' : ''}`}
                                                        onClick={() => handleYtQuality(q.value)}
                                                    >
                                                        {q.label}
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CC Toggle */}
                            <button
                                className={`player-btn ${isYoutube ? (ytCCEnabled ? 'active' : '') : (isSubtitleVisible ? 'active' : '')}`}
                                onClick={() => isYoutube ? toggleYtCC() : setIsSubtitleVisible(v => !v)}
                                title={isYoutube ? (ytCCEnabled ? "Hide Captions" : "Show Captions") : (isSubtitleVisible ? "Hide Subtitles" : "Show Subtitles")}
                            >
                                <img
                                    src={ccLogo}
                                    alt=""
                                    style={{
                                        height: '1.2em',
                                        width: 'auto',
                                        filter: 'brightness(0) invert(1)',
                                        opacity: (isYoutube ? ytCCEnabled : isSubtitleVisible) ? 1 : 0.5,
                                        transition: 'all 0.2s'
                                    }}
                                />
                            </button>

                            {/* Settings (subtitle appearance — non-YouTube only) */}
                            {!isYoutube && (
                                <button
                                    className="player-btn"
                                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                    title="Subtitle Settings"
                                >
                                    <img
                                        src={settingsLogo}
                                        alt=""
                                        style={{
                                            height: '1.2em',
                                            width: 'auto',
                                            filter: 'brightness(0) invert(1)'
                                        }}
                                    />
                                </button>
                            )}

                            {onSubtitleClick && !isYoutube && (
                                <button className="player-btn" onClick={onSubtitleClick} title="Search/Upload Subtitles">
                                    <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" /></svg>
                                </button>
                            )}

                            <button className="player-btn" onClick={toggleFullscreen}>
                                {isFullscreen ? (
                                    <svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
                                ) : (
                                    <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Subtitle Display - Rendered manually to ensure visibility and position */}
            {activeSubtitle && isSubtitleVisible && (
                <div
                    className="custom-subtitle-display"
                    style={{
                        fontSize: `${subtitleSettings.fontSize}rem`,
                        color: subtitleSettings.color,
                        background: subtitleSettings.backgroundColor,
                        textShadow: subtitleSettings.textShadow
                    }}
                >
                    {activeSubtitle}
                </div>
            )}

            {/* Action Notification - Inside container for fullscreen visibility */}
            {actionNotification && (
                <div
                    className="action-notification-player"
                    style={{ cursor: actionNotificationUserId && onUserClick ? 'pointer' : 'default', pointerEvents: 'auto' }}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (actionNotificationUserId && onUserClick) {
                            onUserClick(actionNotificationUserId);
                        }
                    }}
                >
                    <div className="action-notification-avatar">
                        {actionNotificationProfile ? (
                            <img
                                src={actionNotificationProfile}
                                alt={actionNotificationDisplayName || 'User'}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                            />
                        ) : (
                            <span className="action-notification-initial">
                                {actionNotificationDisplayName?.charAt(0).toUpperCase() || '?'}
                            </span>
                        )}
                    </div>
                    <span className="action-notification-message">{actionNotification}</span>
                </div>
            )}
        </div>
    );
});

// ─── YouTube Preview Thumbnails ───────────────────────────────────────────────
// YouTube provides 4 static thumbnails per video:
//   0.jpg  – player background (same as hqdefault)
//   1.jpg  – frame at ~25% of the video
//   2.jpg  – frame at ~50% of the video
//   3.jpg  – frame at ~75% of the video
// We pick the closest one based on where the user hovers on the timeline.

const getYouTubeVideoId = (url: string): string | null => {
    const match = url?.match(
        /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
    );
    return match ? match[1] : null;
};

const getYtPreviewThumbnail = (videoId: string, time: number, duration: number): string => {
    // Map the hover time to one of 3 frame thumbnails:
    //   1.jpg ≈ 25%,  2.jpg ≈ 50%,  3.jpg ≈ 75%
    const pct = duration > 0 ? time / duration : 0;
    let thumbIdx: number;
    if (pct < 0.375) thumbIdx = 1;
    else if (pct < 0.625) thumbIdx = 2;
    else thumbIdx = 3;
    return `https://i.ytimg.com/vi/${videoId}/${thumbIdx}.jpg`;
};
// ──────────────────────────────────────────────────────────────────────────────

// Helper to parse VTT timestamp (00:00:00.000 or 00:00.000) to seconds
const parseVttTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':');
    let seconds = 0;
    if (parts.length === 3) {
        seconds += parseInt(parts[0]) * 3600;
        seconds += parseInt(parts[1]) * 60;
        seconds += parseFloat(parts[2]);
    } else if (parts.length === 2) {
        seconds += parseInt(parts[0]) * 60;
        seconds += parseFloat(parts[1]);
    }
    return seconds;
};

VideoPlayer.displayName = 'VideoPlayer';
