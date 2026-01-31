import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import Plyr from "plyr";
import 'plyr/dist/plyr.css';
import type { RoomMember } from '../types';

// Type alias for Convex IDs
type Id<T extends string> = string & { __tableName: T };

export function RoomPage() {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const { token, user } = useAuth();

    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<Plyr | null>(null);
    const lastSyncRef = useRef<number>(0);
    const isLocalActionRef = useRef(false);
    const isProgrammaticActionRef = useRef(false);

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
    const playMutation = useMutation(api.sync.play);
    const pauseMutation = useMutation(api.sync.pause);
    const seekMutation = useMutation(api.sync.seek);

    const isAdmin = room?.adminId === user?._id;

    // Initialize Plyr when video element is ready
    // Refs for handlers to ensure Plyr always calls the latest version without re-initializing
    const handlePlayRef = useRef<() => void>(() => { });
    const handlePauseRef = useRef<() => void>(() => { });
    const handleSeekedRef = useRef<() => void>(() => { });


    // Initialize Plyr when video element is ready
    useEffect(() => {
        if (videoRef.current && videoSrc) {
            // Destroy existing instance if any (safety check)
            if (playerRef.current) {
                playerRef.current.destroy();
            }

            const player = new Plyr(videoRef.current, {
                controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'fullscreen'],
                settings: ['speed'],
                keyboard: { global: true },
            });
            playerRef.current = player;

            // Bind events to Plyr instance
            player.on('play', () => handlePlayRef.current());
            player.on('pause', () => handlePauseRef.current());
            player.on('seeked', () => handleSeekedRef.current());
        }

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
        };
    }, [videoSrc]);

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

    // Handle local playback events (admin only)
    const handlePlay = useCallback(async () => {
        // Skip if this is a programmatic action from sync (not user-initiated)
        if (isProgrammaticActionRef.current) {
            console.log("Ignored play (programmatic)");
            return;
        }

        console.log("handlePlay called", { isAdmin, hasToken: !!token, hasRoomId: !!roomId, videoCurrent: !!videoRef.current });

        if (!isAdmin) {
            console.warn("User is not admin, cannot play");
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
    }, [isAdmin, token, roomId, playMutation]);

    const handlePause = useCallback(async () => {
        // Skip if this is a programmatic action from sync (not user-initiated)
        if (isProgrammaticActionRef.current) {
            console.log("Ignored pause (programmatic)");
            return;
        }

        console.log("handlePause called", { isAdmin });

        if (!isAdmin || !token || !roomId || !videoRef.current) return;
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
    }, [isAdmin, token, roomId, pauseMutation]);

    const handleSeeked = useCallback(async () => {
        // Skip if this is a programmatic action from sync (not user-initiated)
        if (isProgrammaticActionRef.current) {
            console.log("Ignored seek (programmatic)");
            return;
        }

        console.log("handleSeeked called", { isAdmin });

        if (!isAdmin || !token || !roomId || !videoRef.current) return;
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
    }, [isAdmin, token, roomId, seekMutation]);

    useEffect(() => {
        handlePlayRef.current = handlePlay;
        handlePauseRef.current = handlePause;
        handleSeekedRef.current = handleSeeked;
    }, [handlePlay, handlePause, handleSeeked]);


    // Handle sync state changes from server
    useEffect(() => {
        if (!syncState || !playerRef.current || !videoRef.current) {
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

    // Event listeners are now handled within the Plyr initialization effect


    // Load existing file path from database on mount or when membership updates
    useEffect(() => {
        if (_myMembership?.localFilePath && _myMembership.isReady && !videoSrc) {
            console.log('Loading saved file path:', _myMembership.localFilePath);
            try {
                const fileUrl = convertFileSrc(_myMembership.localFilePath);
                setVideoSrc(fileUrl);
            } catch (err) {
                console.error('Failed to convert saved file path to URL:', err);
            }
        }
    }, [_myMembership, videoSrc]);

    // File selection handler
    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Video',
                    extensions: ['mp4', 'mkv', 'avi', 'webm', 'mov']
                }]
            });

            if (selected) {
                // Debug: log what Tauri returned
                console.log('Tauri file dialog returned:', {
                    selected,
                    type: typeof selected,
                    isString: typeof selected === 'string',
                    isObject: typeof selected === 'object',
                    stringified: JSON.stringify(selected)
                });

                // Handle both string and object (newer Tauri versions return path object)
                const filePath = typeof selected === 'string'
                    ? selected
                    : (selected as { path?: string }).path || String(selected);

                console.log('Extracted filePath:', filePath);

                // Set the file path in the database
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

                // Convert to file URL for video playback
                // Use Tauri's convertFileSrc to properly create an asset URL
                const fileUrl = convertFileSrc(filePath);
                console.log('Converted file URL:', fileUrl);
                setVideoSrc(fileUrl);
            }
        } catch (err) {
            console.error('Failed to select file:', err);
        }
    };

    // Leave room handler
    const handleLeaveRoom = async () => {
        if (token && roomId) {
            await leaveRoomMutation({ token, roomId: roomId as Id<"rooms"> });
        }
        navigate('/');
    };

    if (!room) {
        return (
            <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner spinner-lg" />
            </div>
        );
    }

    return (
        <div className="page">
            {/* Room Header */}
            <header className="header">
                <div className="header-logo">
                    <button className="btn btn-ghost" onClick={handleLeaveRoom}>
                        ← Back
                    </button>
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
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                style={{ width: '100%', height: '100%' }}
                                playsInline
                            />
                        )}
                    </div>

                    {/* Controls Info */}

                    {!isAdmin && videoSrc && (
                        <div className="room-controls">
                            <span style={{ color: 'var(--text-secondary)' }}>
                                🎮 Only the room admin ({room.adminName}) can control playback
                            </span>
                        </div>
                    )}
                </div>

                {/* Sidebar - User List */}
                <div className="room-sidebar">
                    <div className="room-sidebar-header">
                        <h3 className="room-sidebar-title">Viewers</h3>
                        <span className="room-sidebar-count">{members?.length || 0} online</span>
                    </div>

                    <div className="user-list">
                        {(members as RoomMember[] | undefined)?.map((member: RoomMember) => (
                            <div key={member._id} className="user-item">
                                <div className="avatar avatar-sm">
                                    {member.displayName.charAt(0).toUpperCase()}
                                </div>
                                <div className="user-item-info">
                                    <div className="user-item-name">{member.displayName}</div>
                                    <div className="user-item-status">
                                        {member.isReady ? '✅ Ready' : '⏳ Selecting file...'}
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
        </div>
    );
}
