import { forwardRef, useEffect, useRef, useState, useCallback } from 'react';
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
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({
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
    onUserClick
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
    const controlsTimeoutRef = useRef<number | null>(null);

    // Timeline Hover State
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverPos, setHoverPos] = useState<number>(0);
    const previewVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (previewVideoRef.current && hoverTime !== null && isFinite(hoverTime)) {
            previewVideoRef.current.currentTime = hoverTime;
        }
    }, [hoverTime]);

    // This local ref is used if the parent doesn't provide one, but we expect the parent to provide one normally.
    // However, to use it internally we need to ensure we have access to it.
    // We'll use a callback ref or an object ref properly.
    // For simplicity, we assume the parent passes a RefObject. If not, we'd need useImperativeHandle.
    // But since we are replacing Plyr usage in RoomPage, and RoomPage uses videoRef, we can just use the forwarded ref.
    // We need to cast it to utilize it internally.
    const internalVideoRef = (ref as React.RefObject<HTMLVideoElement>);

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

        video.addEventListener('timeupdate', updateState);
        video.addEventListener('play', updateState);
        video.addEventListener('pause', updateState);
        video.addEventListener('loadedmetadata', updateState);
        video.addEventListener('volumechange', updateState);

        return () => {
            video.removeEventListener('timeupdate', updateState);
            video.removeEventListener('play', updateState);
            video.removeEventListener('pause', updateState);
            video.removeEventListener('loadedmetadata', updateState);
            video.removeEventListener('volumechange', updateState);
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
        if (internalVideoRef?.current) {
            if (internalVideoRef.current.paused) {
                internalVideoRef.current.play();
            } else {
                internalVideoRef.current.pause();
            }
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (internalVideoRef?.current) {
            internalVideoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = parseFloat(e.target.value);
        if (internalVideoRef?.current) {
            internalVideoRef.current.volume = vol;
            internalVideoRef.current.muted = vol === 0;
        }
    };

    const toggleMute = () => {
        if (internalVideoRef?.current) {
            internalVideoRef.current.muted = !internalVideoRef.current.muted;
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
            <video
                ref={ref}
                src={src || undefined}
                className="custom-player-video"
                onClick={togglePlay}
                poster={getImageUrl(poster)}
                playsInline
            />

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
                            <video
                                ref={previewVideoRef}
                                src={src || undefined}
                                className="preview-video"
                                muted
                                preload="auto"
                                style={{ display: 'block' }}
                            />
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
                            {/* CC Toggle */}
                            <button
                                className={`player-btn ${isSubtitleVisible ? 'active' : ''}`}
                                onClick={() => setIsSubtitleVisible(!isSubtitleVisible)}
                                title={isSubtitleVisible ? "Hide Subtitles" : "Show Subtitles"}
                            >
                                <img
                                    src={ccLogo}
                                    alt=""
                                    style={{
                                        height: '1.2em',
                                        width: 'auto',
                                        filter: 'brightness(0) invert(1)',
                                        opacity: isSubtitleVisible ? 1 : 0.5,
                                        transition: 'all 0.2s'
                                    }}
                                />
                            </button>

                            {/* Settings */}
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

                            {onSubtitleClick && (
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
