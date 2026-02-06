import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import exitRoomLogo from '../assets/exit_room_logo.png';
import readyLogo from '../assets/ready_logo.png';
import notReadyLogo from '../assets/not_ready_logo.png';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { VideoPlayer } from '../components/VideoPlayer';
import type { RoomMember } from '../types';
import { SubtitleModal } from '../components/SubtitleModal';
import { getImageUrl } from '../lib/tmdb';
import { PostWatchModal } from '../components/PostWatchModal';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { UserProfileModal } from '../components/UserProfileModal';

// Detect if running inside Tauri
const isTauri = !!(window as any).__TAURI_INTERNALS__;

// Format seconds to MM:SS
function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Type alias for Convex IDs
type Id<T extends string> = string & { __tableName: T };

export function RoomPage() {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const { token, user } = useAuth();

    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const lastSyncRef = useRef<number>(0);
    const isLocalActionRef = useRef(false);
    const isProgrammaticActionRef = useRef(false);
    const currentFilePathRef = useRef<string | null>(null);


    // Subtitle state
    const [isSubtitleModalOpen, setIsSubtitleModalOpen] = useState(false);
    const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
    const [subtitleLabel, setSubtitleLabel] = useState<string>("");

    // Action notification state
    const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
    const [notificationVisible, setNotificationVisible] = useState(false);
    const [notificationKey, setNotificationKey] = useState(0);
    const [notificationProfile, setNotificationProfile] = useState<string | undefined>(undefined);
    const [notificationDisplayName, setNotificationDisplayName] = useState<string | undefined>(undefined);
    const [notificationIsPause, setNotificationIsPause] = useState(false);
    const prevSyncUpdateRef = useRef<number | null>(null);

    // Post-watch modal state
    const [showPostWatchModal, setShowPostWatchModal] = useState(false);
    const lastMovieTitleRef = useRef<string | null>(null);
    const lastMoviePosterRef = useRef<string | null>(null);
    const lastTmdbIdRef = useRef<number | undefined>(undefined);
    const lastParticipantsRef = useRef<string[]>([]);

    // Confirmation modals
    const [isConfirmLeaveOpen, setIsConfirmLeaveOpen] = useState(false);
    const [isConfirmEndOpen, setIsConfirmEndOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

    const [showUnsupportedModal, setShowUnsupportedModal] = useState(false);

    // Convex queries and mutations
    const room = useQuery(api.rooms.getRoom, roomId ? { roomId: roomId as Id<"rooms"> } : "skip");
    const members = useQuery(api.roomMembers.getRoomMembers, roomId ? { roomId: roomId as Id<"rooms"> } : "skip");
    const _myMembership = useQuery(api.roomMembers.getMyMembership, {
        token: token ?? undefined,
        roomId: roomId as Id<"rooms">
    });
    const syncState = useQuery(api.sync.getSyncState, roomId ? { roomId: roomId as Id<"rooms"> } : "skip");

    const setFilePathMutation = useMutation(api.roomMembers.setFilePath);
    const leaveRoomMutation = useMutation(api.roomMembers.leaveRoom);
    const deleteRoomMutation = useMutation(api.rooms.deleteRoom);
    const playMutation = useMutation(api.sync.play);
    const pauseMutation = useMutation(api.sync.pause);
    const seekMutation = useMutation(api.sync.seek);

    const isAdmin = room?.adminId === user?._id;
    const canControl = isAdmin || room?.everyoneCanControl;



    // Server time offset state
    const [serverOffset, setServerOffset] = useState<number>(0);
    const getServerTime = useAction(api.utils.getServerTime);

    // Calculate server time offset on mount
    useEffect(() => {
        const syncClock = async () => {
            const start = Date.now();
            const serverTime = await getServerTime({});
            const end = Date.now();
            const latency = (end - start) / 2;
            const offset = serverTime - (end - latency);

            console.log('Clock sync:', {
                clientTime: end,
                serverTime,
                latency,
                offset
            });
            setServerOffset(offset);
        };

        syncClock();
    }, [getServerTime]);

    // Detect sync state changes and show action notifications
    useEffect(() => {
        if (!syncState || !user) return;

        // Skip if this is the first load (no previous ref)
        if (prevSyncUpdateRef.current === null) {
            prevSyncUpdateRef.current = syncState.lastUpdatedAt;
            return;
        }

        // Skip if nothing changed
        if (prevSyncUpdateRef.current === syncState.lastUpdatedAt) {
            return;
        }

        // Skip if the current user performed the action
        if (syncState.lastUpdatedBy === user._id) {
            prevSyncUpdateRef.current = syncState.lastUpdatedAt;
            return;
        }

        // Skip if this is a play action that should hide a pause notification
        if (syncState.lastAction === 'play' && notificationIsPause) {
            setNotificationVisible(false);
            setNotificationIsPause(false);
        }

        // Build notification message based on action type
        let actionText = '';
        const username = syncState.lastUpdaterName || 'Someone';

        switch (syncState.lastAction) {
            case 'play':
                actionText = `${username} Resumed`;
                break;
            case 'pause':
                actionText = `${username} Paused`;
                break;
            case 'seek':
                actionText = `${username} Skipped to ${formatTime(syncState.currentTime)}`;
                break;
            default:
                actionText = `${username} updated playback`;
        }

        // Show notification
        setNotificationMessage(actionText);
        setNotificationProfile(syncState.lastUpdaterProfilePicture);
        setNotificationDisplayName(syncState.lastUpdaterName);
        setNotificationIsPause(false);
        setNotificationVisible(true);
        setNotificationKey(prev => prev + 1); // Force re-render for animation

        // Hide after 4 seconds
        const timer = setTimeout(() => {
            setNotificationVisible(false);
        }, 4000);

        prevSyncUpdateRef.current = syncState.lastUpdatedAt;
        return () => clearTimeout(timer);
    }, [syncState, user, notificationIsPause]);

    // Handle local playback events (admin only)
    const handlePlay = useCallback(async () => {
        // Skip if this is a programmatic action from sync (not user-initiated)
        if (isProgrammaticActionRef.current) {
            console.log("Ignored play (programmatic)");
            return;
        }

        console.log("handlePlay called", { canControl, hasToken: !!token, hasRoomId: !!roomId, videoCurrent: !!videoRef.current });

        if (!canControl) {
            console.warn("User cannot control playback");
            return;
        }
        if (!token || !roomId || !videoRef.current) {
            console.error("Missing requirements for play mutation");
            return;
        }

        isLocalActionRef.current = true;
        try {
            await playMutation({
                token,
                roomId: roomId as Id<"rooms">,
                currentTime: videoRef.current.currentTime
            });
            console.log("Play mutation sent successfully");
        } catch (e: any) {
            console.error("Play mutation failed", e);
            alert("Play failed: " + (e.message || String(e)));
            isLocalActionRef.current = false; // Reset if failed so we can accept updates
        }
    }, [canControl, token, roomId, playMutation]);

    const handlePause = useCallback(async () => {
        // Skip if this is a programmatic action from sync (not user-initiated)
        if (isProgrammaticActionRef.current) {
            console.log("Ignored pause (programmatic)");
            return;
        }

        console.log("handlePause called", { canControl });

        if (!canControl || !token || !roomId || !videoRef.current) return;
        isLocalActionRef.current = true;
        try {
            await pauseMutation({
                token,
                roomId: roomId as Id<"rooms">,
                currentTime: videoRef.current.currentTime
            });
            console.log("Pause mutation sent");
        } catch (e: any) {
            console.error("Pause mutation failed", e);
            alert("Pause failed: " + (e.message || String(e)));
            isLocalActionRef.current = false;
        }
    }, [canControl, token, roomId, pauseMutation]);

    const handleSeeked = useCallback(async () => {
        // Skip if this is a programmatic action from sync (not user-initiated)
        if (isProgrammaticActionRef.current) {
            console.log("Ignored seek (programmatic)");
            return;
        }

        console.log("handleSeeked called", { canControl });

        if (!canControl || !token || !roomId || !videoRef.current) return;
        isLocalActionRef.current = true;
        try {
            await seekMutation({
                token,
                roomId: roomId as Id<"rooms">,
                currentTime: videoRef.current.currentTime
            });
            console.log("Seek mutation sent");
        } catch (e: any) {
            console.error("Seek mutation failed", e);
            alert("Seek failed: " + (e.message || String(e)));
            isLocalActionRef.current = false;
        }
    }, [canControl, token, roomId, seekMutation]);

    // Attach listeners strictly to the Ref if possible, but VideoPlayer attaches its own.
    // However, for SYNC, we need to know when User triggers play/pause.
    // VideoPlayer component doesn't expose onPlay etc props that are "user initiated" easily vs "programmatic".
    // ACTUALLY, VideoPlayer logic uses `video.addEventListener('play', updateState)`.
    // The Standard DOM 'play' event fires for both code and user.
    // Our logic handles this via `isProgrammaticActionRef`.
    // We need to attach OUR listeners to the video element.
    // Since `videoRef` is passed to VideoPlayer and then to <video>, `videoRef.current` IS the video element.
    // We can use an effect here to attach the sync listeners.

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('seeked', handleSeeked);

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('seeked', handleSeeked);
        };
    }, [videoSrc, handlePlay, handlePause, handleSeeked]); // Re-attach if src changes (new video element potentially?)


    // Handle sync state changes from server
    useEffect(() => {
        if (!syncState || !videoRef.current) {
            return;
        }

        // If local action flag is set, skip this update to prevent jitter for the admin
        if (isLocalActionRef.current) {
            isLocalActionRef.current = false;
            return;
        }

        const video = videoRef.current;

        // Calculate the actual target time using server offset
        // targetTime = storedTime + (CurrentServerTime - LastUpdatedServerTime)
        // CurrentServerTime = Date.now() + offset
        let targetTime = syncState.currentTime;

        if (syncState.isPlaying) {
            const now = Date.now();
            const currentServerTime = now + serverOffset;
            const secondsSinceUpdate = (currentServerTime - syncState.lastUpdatedAt) / 1000;

            // Only add positive elapsed time
            if (secondsSinceUpdate > 0) {
                targetTime += secondsSinceUpdate;
            }
        }

        const timeDrift = Math.abs(video.currentTime - targetTime);

        console.log('Sync Update:', {
            isPlaying: syncState.isPlaying,
            localState: video.paused ? 'paused' : 'playing',
            drift: timeDrift,
            targetTime
        });

        // Sync playback rate
        if (Math.abs(video.playbackRate - syncState.playbackRate) > 0.1) {
            video.playbackRate = syncState.playbackRate;
        }

        // Sync play/pause state (mark as programmatic to avoid feedback loop)
        // Use timeout to ensure flag stays set until after async event fires
        if (syncState.isPlaying && video.paused) {
            isProgrammaticActionRef.current = true;
            video.play().catch(err => {
                console.error("Autoplay failed:", err);
            });
            setTimeout(() => { isProgrammaticActionRef.current = false; }, 100);
        } else if (!syncState.isPlaying && !video.paused) {
            isProgrammaticActionRef.current = true;
            video.pause();
            setTimeout(() => { isProgrammaticActionRef.current = false; }, 100);
        }

        // Only seek if drift is significant
        if (timeDrift > 0.5) {
            console.log(`Syncing: drift ${timeDrift.toFixed(2)}s, seeking to ${targetTime.toFixed(2)}`);
            setIsSyncing(true);
            isProgrammaticActionRef.current = true;
            video.currentTime = targetTime;
            setTimeout(() => { isProgrammaticActionRef.current = false; }, 100);
            setTimeout(() => setIsSyncing(false), 500);
        }

        lastSyncRef.current = syncState.lastUpdatedAt;
    }, [syncState, serverOffset]);


    // Periodic sync check to handle drift (buffering, performance)
    useEffect(() => {
        if (!syncState?.isPlaying || !videoRef.current) return;

        const checkSync = () => {
            const video = videoRef.current;
            if (!video || !syncState) return;

            const now = Date.now();
            const currentServerTime = now + serverOffset;
            const secondsSinceUpdate = (currentServerTime - syncState.lastUpdatedAt) / 1000;

            // Safety check: if secondsSinceUpdate is wild, ignore
            if (secondsSinceUpdate < -5 || secondsSinceUpdate > 86400) return;

            const targetTime = syncState.currentTime + Math.max(0, secondsSinceUpdate);
            const drift = Math.abs(video.currentTime - targetTime);

            // Larger threshold for periodic checks to avoid fighting frequent small lags
            if (drift > 2.0) {
                console.log(`Periodic Sync: drift ${drift.toFixed(2)}s, seeking to ${targetTime.toFixed(2)}`);
                setIsSyncing(true);
                isProgrammaticActionRef.current = true;
                video.currentTime = targetTime;
                setTimeout(() => { isProgrammaticActionRef.current = false; }, 100);
                setTimeout(() => setIsSyncing(false), 500);
            }

            // Ensure playback state is correct (retry autoplay)
            if (syncState.isPlaying && video.paused) {
                console.log("Periodic Sync: Retrying playback");
                isProgrammaticActionRef.current = true;
                video.play().catch(console.error);
                setTimeout(() => { isProgrammaticActionRef.current = false; }, 100);
            }
        };

        const interval = setInterval(checkSync, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, [syncState, serverOffset]);


    // Load existing file path from database on mount or when membership updates
    useEffect(() => {
        if (_myMembership?.localFilePath && _myMembership.isReady && !videoSrc) {
            console.log('Loading saved file path:', _myMembership.localFilePath);
            currentFilePathRef.current = _myMembership.localFilePath;

            if (isTauri) {
                import('@tauri-apps/api/core').then(({ convertFileSrc }) => {
                    try {
                        const fileUrl = convertFileSrc(_myMembership.localFilePath!);
                        setVideoSrc(fileUrl);
                    } catch (err) {
                        console.error('Failed to convert saved file path to URL:', err);
                    }
                });
            }
            // In browser mode, we can't restore from a file path (no File object persisted),
            // so the user will need to re-select the file.
        }
    }, [_myMembership, videoSrc]);

    // Hidden file input ref for browser fallback
    const fileInputRef = useRef<HTMLInputElement>(null);

    // File selection handler
    const handleSelectFile = async () => {
        if (isTauri) {
            try {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const { convertFileSrc } = await import('@tauri-apps/api/core');

                const selected = await open({
                    multiple: false,
                    filters: [{
                        name: 'Video',
                        extensions: ['mp4', 'mkv', 'avi', 'webm', 'mov']
                    }]
                });

                if (selected) {
                    const filePath = typeof selected === 'string'
                        ? selected
                        : (selected as { path?: string }).path || String(selected);

                    if (token && roomId) {
                        const result = await setFilePathMutation({
                            token,
                            roomId: roomId as Id<"rooms">,
                            localFilePath: filePath
                        });

                        if (!result.isValid) {
                            alert(`File name doesn't match!\nExpected: "${result.expectedFileName}"\nSelected: "${result.actualFileName || 'unknown'}"\nFull path: "${filePath}"`);
                            return;
                        }
                    }

                    currentFilePathRef.current = filePath;
                    const fileUrl = convertFileSrc(filePath);
                    setVideoSrc(fileUrl);
                }
            } catch (err) {
                console.error('Failed to select file:', err);
            }
        } else {
            // Browser fallback: trigger hidden file input
            fileInputRef.current?.click();
        }
    };

    // Browser file input change handler
    const handleBrowserFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            if (token && roomId) {
                const result = await setFilePathMutation({
                    token,
                    roomId: roomId as Id<"rooms">,
                    localFilePath: file.name
                });

                if (!result.isValid) {
                    alert(`File name doesn't match!\nExpected: "${result.expectedFileName}"\nSelected: "${file.name}"`);
                    return;
                }
            }

            currentFilePathRef.current = file.name;
            const fileUrl = URL.createObjectURL(file);
            setVideoSrc(fileUrl);
        } catch (err) {
            console.error('Failed to load file:', err);
        }
    };

    // Handle runtime codec error (audio only detected)
    const handleCodecError = useCallback(async () => {
        console.log('Codec error detected at runtime');
        setShowUnsupportedModal(true);
    }, []);

    const handleOpenInVlc = async () => {
        if (!isTauri) return;
        const filePath = currentFilePathRef.current;
        if (!filePath) return;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            console.log('Opening in VLC:', filePath);
            await invoke('open_vlc', { filePath });
            setShowUnsupportedModal(false);

            if (videoRef.current && !videoRef.current.paused) {
                videoRef.current.pause();
            }
        } catch (err) {
            console.error('Failed to open VLC:', err);
            alert('Failed to launch VLC. Make sure it is installed.');
        }
    };



    // Leave room handler (for viewers)
    const handleLeaveRoom = async () => {
        setIsConfirmLeaveOpen(true);
    };

    const executeLeaveRoom = async () => {
        if (token && roomId) {
            await leaveRoomMutation({ token, roomId: roomId as Id<"rooms"> });
        }
        setIsConfirmLeaveOpen(false);
        setShowPostWatchModal(true);
    };

    // End room handler (for admin)
    const handleEndRoom = async () => {
        setIsConfirmEndOpen(true);
    };

    const executeEndRoom = async () => {
        if (token && roomId) {
            try {
                await deleteRoomMutation({ token, roomId: roomId as Id<"rooms"> });
                setIsConfirmEndOpen(false);
                setShowPostWatchModal(true);
            } catch (err) {
                console.error('Failed to end room:', err);
                alert('Failed to end room');
                setIsConfirmEndOpen(false);
            }
        }
    };

    const handleSubtitleLoaded = (vttContent: string, label: string) => {
        if (subtitleUrl) {
            URL.revokeObjectURL(subtitleUrl);
        }

        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        setSubtitleUrl(url);
        setSubtitleLabel(label);
    };

    // Capture room details for post-watch modal
    useEffect(() => {
        if (room?.movieTitle) {
            lastMovieTitleRef.current = room.movieTitle;
        }
        if (room?.moviePoster) {
            lastMoviePosterRef.current = room.moviePoster;
        }
        if (room?.tmdbId) {
            lastTmdbIdRef.current = room.tmdbId;
        }
    }, [room?.movieTitle, room?.moviePoster, room?.tmdbId]);

    // Track participants
    useEffect(() => {
        if (members && members.length > 0) {
            lastParticipantsRef.current = members.map(m => m.displayName);
        }
    }, [members]);

    // Show modal if room is suddenly gone (and we haven't already marked it)
    useEffect(() => {
        if (room === null && lastMovieTitleRef.current && !showPostWatchModal) {
            setShowPostWatchModal(true);
        }
    }, [room, showPostWatchModal]);

    if (!room) {
        return (
            <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                <div className="empty-state">
                    <div className="empty-state-icon">
                        <img src={logo} alt="Absolute Cinema" style={{ height: '64px', marginBottom: '16px' }} />
                    </div>
                    <h2 className="empty-state-title">Room Not Found</h2>
                    <p className="empty-state-text">
                        The room might have been ended by the admin or it doesn't exist anymore.
                    </p>
                    <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: '24px' }}>
                        Go to Home
                    </button>
                </div>
                {showPostWatchModal && lastMovieTitleRef.current && (
                    <PostWatchModal
                        movieTitle={lastMovieTitleRef.current}
                        moviePoster={lastMoviePosterRef.current || undefined}
                        tmdbId={lastTmdbIdRef.current}
                        participants={lastParticipantsRef.current}
                        onClose={() => navigate('/')}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="page">
            {/* Hidden file input for browser fallback */}
            {!isTauri && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={handleBrowserFileChange}
                />
            )}
            {/* Room Header */}
            <header className="header">
                <div className="header-logo">
                    {isAdmin ? (
                        <button className="btn btn-danger btn-sm" onClick={handleEndRoom}>
                            <img
                                src={exitRoomLogo}
                                alt=""
                                style={{
                                    height: '1.2em',
                                    marginRight: '8px',
                                    verticalAlign: 'middle',
                                    filter: 'brightness(0) invert(1)'
                                }}
                            />
                            End Room
                        </button>
                    ) : (
                        <button className="btn btn-ghost btn-sm" onClick={handleLeaveRoom}>
                            <img
                                src={exitRoomLogo}
                                alt=""
                                style={{
                                    height: '1.2em',
                                    marginRight: '8px',
                                    verticalAlign: 'middle',
                                    filter: 'brightness(0) invert(0.7)'
                                }}
                            />
                            Exit Room
                        </button>
                    )}
                    <div>
                        <h1 style={{ fontSize: '1.25rem' }}>{room.name}</h1>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            🎥 {room.movieTitle}
                        </span>
                    </div>
                </div>
                <div className="header-nav">
                    <div className="sync-status">
                        <span className={`sync-status-dot ${isSyncing ? 'syncing' : ''}`} />
                        <span>{isSyncing ? 'Syncing...' : 'In Sync'}</span>
                    </div>

                    {isAdmin && (
                        <span className="room-card-badge">Admin</span>
                    )}

                </div>
            </header>

            {/* Main Content */}
            <div className="room-layout">
                {/* Video Player Area */}
                <div className="room-main">
                    <div className="player-container">
                        {!videoSrc ? (
                            <div className="player-overlay">
                                <div className="file-prompt">
                                    <div className="file-prompt-icon">📁</div>
                                    <h3 className="file-prompt-title">Select Your Movie File</h3>
                                    <p className="file-prompt-hint">
                                        Make sure you have a copy of the movie on your computer
                                    </p>
                                    <div className="file-prompt-filename">
                                        {room.movieFileName}
                                    </div>
                                    <button className="btn btn-primary" onClick={handleSelectFile}>
                                        Choose File
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <VideoPlayer
                                ref={videoRef}
                                src={videoSrc}
                                poster={room.moviePoster}
                                subtitleUrl={subtitleUrl}
                                subtitleLabel={subtitleLabel}
                                onSubtitleClick={() => setIsSubtitleModalOpen(true)}
                                movieTitle={room.movieTitle}
                                actionNotification={notificationVisible ? notificationMessage : null}
                                actionNotificationProfile={notificationProfile}
                                actionNotificationDisplayName={notificationDisplayName}
                                actionNotificationUserId={syncState?.lastUpdatedBy}
                                actionNotificationIsPause={notificationIsPause}
                                onUserClick={(uid) => setSelectedUserId(uid)}
                                onCodecError={handleCodecError}
                                onFixIssues={isTauri ? handleOpenInVlc : undefined}
                            />
                        )}
                    </div>

                    {/* Controls Info */}

                    {!canControl && videoSrc && (
                        <div className="room-controls">
                            <span style={{ color: 'var(--text-secondary)' }}>
                                🎮 Only the room admin ({room.adminName}) can control playback
                            </span>
                        </div>
                    )}
                    {room.everyoneCanControl && videoSrc && (
                        <div className="room-controls">
                            <span style={{ color: 'var(--primary)' }}>
                                🎮 Shared Control: Anyone can control playback
                            </span>
                        </div>
                    )}
                </div>

                {/* Sidebar - User List */}
                <div className="room-sidebar">
                    {room.moviePoster && (
                        <div className="room-poster" style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
                            <img
                                src={getImageUrl(room.moviePoster)}
                                alt={room.movieTitle}
                                style={{
                                    width: '100%',
                                    borderRadius: '12px',
                                    boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
                                    aspectRatio: '2/3',
                                    objectFit: 'cover'
                                }}
                            />
                        </div>
                    )}
                    <div className="room-sidebar-header">
                        <h3 className="room-sidebar-title">Viewers</h3>
                        <span className="room-sidebar-count">{members?.length || 0} online</span>
                    </div>

                    <div className="user-list">
                        {(members as RoomMember[] | undefined)?.map((member: RoomMember) => (
                            <div
                                key={member._id}
                                className="user-item"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedUserId(member.userId)}
                            >
                                <div className="avatar avatar-sm" style={{ overflow: 'hidden' }}>
                                    {member.profilePicture ? (
                                        <img
                                            src={member.profilePicture}
                                            alt={member.displayName}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        member.displayName.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className="user-item-info">
                                    <div className="user-item-name">{member.displayName}</div>
                                    <div className="user-item-status" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {member.isReady ? (
                                            <>
                                                <img src={readyLogo} alt="" style={{ height: '1.1em', width: 'auto' }} />
                                                <span style={{ color: 'var(--success)' }}>Ready</span>
                                            </>
                                        ) : (
                                            <>
                                                <img src={notReadyLogo} alt="" style={{ height: '1.1em', width: 'auto' }} />
                                                <span style={{ color: 'var(--warning)' }}>Selecting file...</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {member.isAdmin && (
                                    <span className="user-item-badge">Admin</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <SubtitleModal
                isOpen={isSubtitleModalOpen}
                onClose={() => setIsSubtitleModalOpen(false)}
                onSubtitleLoaded={handleSubtitleLoaded}
                movieTitle={room.movieTitle}
                tmdbId={room.tmdbId}
            />

            {showPostWatchModal && lastMovieTitleRef.current && (
                <PostWatchModal
                    movieTitle={lastMovieTitleRef.current}
                    moviePoster={lastMoviePosterRef.current || undefined}
                    tmdbId={lastTmdbIdRef.current}
                    participants={lastParticipantsRef.current}
                    onClose={() => navigate('/')}
                />
            )}

            <ConfirmationModal
                isOpen={showUnsupportedModal}
                title="Unsupported Video"
                message="This video format is not supported by your browser. Open it in VLC Player for the best experience?"
                confirmText="Open in VLC"
                cancelText="Close"
                onConfirm={handleOpenInVlc}
                onCancel={() => setShowUnsupportedModal(false)}
            />

            <ConfirmationModal
                isOpen={isConfirmLeaveOpen}
                title="Exit Room"
                message="Are you sure you want to leave the watch party?"
                icon={exitRoomLogo}
                confirmText="Leave Room"
                onConfirm={executeLeaveRoom}
                onCancel={() => setIsConfirmLeaveOpen(false)}
                isDanger={true}
            />

            <ConfirmationModal
                isOpen={isConfirmEndOpen}
                title="End Room"
                message="This will end the watch party for everyone. Are you sure?"
                icon={exitRoomLogo}
                confirmText="End for All"
                onConfirm={executeEndRoom}
                onCancel={() => setIsConfirmEndOpen(false)}
                isDanger={true}
            />

            {selectedUserId && (
                <UserProfileModal
                    userId={selectedUserId}
                    onClose={() => setSelectedUserId(null)}
                />
            )}
        </div>
    );
}
