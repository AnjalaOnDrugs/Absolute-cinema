import { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC, {
    IAgoraRTCClient,
    IMicrophoneAudioTrack,
    IAgoraRTCRemoteUser,
    IRemoteAudioTrack,
} from 'agora-rtc-sdk-ng';
import { AIDenoiserExtension, AIDenoiserProcessorMode, AIDenoiserProcessorLevel } from 'agora-extension-ai-denoiser';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { AGORA_APP_ID, stringToNumericUid } from '../lib/agoraConfig';

// Disable Agora SDK logs in production
AgoraRTC.setLogLevel(import.meta.env.PROD ? 4 : 1);

// --- AI Noise Suppression singleton ---
let denoiserExtension: AIDenoiserExtension | null = null;
let denoiserRegistered = false;

function getDenoiserExtension(): AIDenoiserExtension | null {
    if (denoiserExtension) return denoiserExtension;
    try {
        denoiserExtension = new AIDenoiserExtension({ assetsPath: '/external' });
        if (!denoiserExtension.checkCompatibility()) {
            console.warn('AI Noise Suppression is not supported in this browser');
            denoiserExtension = null;
            return null;
        }
        if (!denoiserRegistered) {
            AgoraRTC.registerExtensions([denoiserExtension]);
            denoiserRegistered = true;
        }
        denoiserExtension.onloaderror = (e) => {
            console.error('AI Denoiser Wasm load error:', e);
        };
        return denoiserExtension;
    } catch (err) {
        console.error('Failed to create AI Denoiser extension:', err);
        return null;
    }
}

interface RemoteVoiceUser {
    convexUserId: string;
    audioTrack?: IRemoteAudioTrack;
    volume: number; // 0-100, local volume setting
}

export interface UseVoiceChatReturn {
    isInVoice: boolean;
    isConnecting: boolean;
    isMuted: boolean;
    isDeafened: boolean;
    isNoiseSuppressed: boolean;
    isNoiseSuppressionAvailable: boolean;
    speakingUsers: Set<string>;     // Set of Convex user IDs currently speaking
    userVolumes: Map<string, number>; // Convex userId -> volume (0-100)
    joinVoice: () => Promise<void>;
    leaveVoice: () => Promise<void>;
    toggleMute: () => void;
    toggleDeafen: () => void;
    toggleNoiseSuppression: () => void;
    setUserVolume: (userId: string, volume: number) => void;
}

export function useVoiceChat(
    roomId: string | undefined,
    userId: string | undefined,
    token: string | null,
    highQualityAudio: boolean = false
): UseVoiceChatReturn {
    const [isInVoice, setIsInVoice] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isNoiseSuppressed, setIsNoiseSuppressed] = useState(false);
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    const [userVolumes, setUserVolumes] = useState<Map<string, number>>(new Map());

    const clientRef = useRef<IAgoraRTCClient | null>(null);
    const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
    const denoiserProcessorRef = useRef<any>(null);
    // Keyed by numeric Agora UID (as string), value contains convexUserId
    const remoteUsersRef = useRef<Map<string, RemoteVoiceUser>>(new Map());
    const isDeafenedRef = useRef(false);
    const preDeafenVolumesRef = useRef<Map<string, number>>(new Map());
    // Maps numeric Agora UID (as string) -> Convex user ID
    const uidMapRef = useRef<Map<string, string>>(new Map());

    // Check if AI Noise Suppression is available
    const isNoiseSuppressionAvailable = !!getDenoiserExtension();

    // Convex mutations and actions
    const joinVoiceMutation = useMutation(api.voiceState.joinVoice);
    const leaveVoiceMutation = useMutation(api.voiceState.leaveVoice);
    const setMutedMutation = useMutation(api.voiceState.setMuted);
    const generateTokenAction = useAction(api.agora.generateToken);

    // Keep deafen ref in sync
    useEffect(() => {
        isDeafenedRef.current = isDeafened;
    }, [isDeafened]);

    // Resolve a numeric Agora UID to a Convex user ID
    const resolveUid = useCallback((agoraUid: string | number): string => {
        const key = String(agoraUid);
        return uidMapRef.current.get(key) ?? key;
    }, []);

    const handleUserPublished = useCallback(async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType !== 'audio' || !clientRef.current) return;

        await clientRef.current.subscribe(user, 'audio');
        const agoraUid = String(user.uid);
        const convexUserId = resolveUid(agoraUid);
        const existingVolume = remoteUsersRef.current.get(agoraUid)?.volume ?? 100;

        remoteUsersRef.current.set(agoraUid, {
            convexUserId,
            audioTrack: user.audioTrack,
            volume: existingVolume,
        });

        if (user.audioTrack) {
            if (isDeafenedRef.current) {
                user.audioTrack.setVolume(0);
            } else {
                user.audioTrack.setVolume(existingVolume);
            }
            user.audioTrack.play();
        }
    }, [resolveUid]);

    const handleUserUnpublished = useCallback((user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType !== 'audio') return;
        const agoraUid = String(user.uid);
        const remote = remoteUsersRef.current.get(agoraUid);
        if (remote?.audioTrack) {
            remote.audioTrack.stop();
        }
        remoteUsersRef.current.delete(agoraUid);
    }, []);

    const handleUserLeft = useCallback((user: IAgoraRTCRemoteUser) => {
        const agoraUid = String(user.uid);
        const convexUserId = resolveUid(agoraUid);
        const remote = remoteUsersRef.current.get(agoraUid);
        if (remote?.audioTrack) {
            remote.audioTrack.stop();
        }
        remoteUsersRef.current.delete(agoraUid);
        uidMapRef.current.delete(agoraUid);
        setUserVolumes(prev => {
            const next = new Map(prev);
            next.delete(convexUserId);
            return next;
        });
    }, [resolveUid]);

    const handleVolumeIndicator = useCallback((volumes: Array<{ uid: string | number; level: number }>) => {
        const speaking = new Set<string>();
        for (const v of volumes) {
            if (v.level > 5) {
                // Convert Agora UID to Convex user ID for the speaking set
                speaking.add(resolveUid(v.uid));
            }
        }
        setSpeakingUsers(speaking);
    }, [resolveUid]);

    const joinVoice = useCallback(async () => {
        if (!roomId || !userId || !token || isInVoice || isConnecting) return;

        setIsConnecting(true);
        try {
            // Convert our string userId to a numeric UID for Agora
            const numericUid = stringToNumericUid(userId);

            // Register our own UID mapping
            uidMapRef.current.set(String(numericUid), userId);

            // Generate an Agora token server-side
            const agoraToken = await generateTokenAction({
                channelName: roomId,
                uid: numericUid,
            });

            const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
            clientRef.current = client;

            // Set up event listeners before joining
            client.on('user-published', handleUserPublished);
            client.on('user-unpublished', handleUserUnpublished);
            client.on('user-left', handleUserLeft);
            client.on('volume-indicator', handleVolumeIndicator);

            // Join channel with token and numeric UID
            await client.join(AGORA_APP_ID, roomId, agoraToken, numericUid);

            // Enable volume indicator for speaking detection
            client.enableAudioVolumeIndicator();

            // Create and publish local audio track
            const localTrack = await AgoraRTC.createMicrophoneAudioTrack(
                highQualityAudio
                    ? {
                        encoderConfig: {
                            sampleRate: 48000,
                            stereo: true,
                            bitrate: 128,
                        },
                    }
                    : undefined
            );
            localTrackRef.current = localTrack;

            // Set up AI Noise Suppression pipeline
            const ext = getDenoiserExtension();
            if (ext) {
                try {
                    const processor = ext.createProcessor();
                    denoiserProcessorRef.current = processor;
                    localTrack.pipe(processor).pipe(localTrack.processorDestination);
                    // Start disabled by default; user can toggle on
                    await processor.disable();
                    setIsNoiseSuppressed(false);

                    // Handle overload by falling back to stationary NS
                    processor.on('overload', async () => {
                        console.warn('AI Denoiser overload — switching to STATIONARY_NS');
                        try {
                            await processor.setMode(AIDenoiserProcessorMode.STATIONARY_NS);
                        } catch { /* ignore */ }
                    });
                } catch (err) {
                    console.error('Failed to set up AI Noise Suppression:', err);
                    denoiserProcessorRef.current = null;
                }
            }

            await client.publish([localTrack]);

            // Update Convex state
            await joinVoiceMutation({ token, roomId: roomId as any });

            setIsInVoice(true);
            setIsMuted(false);
            setIsDeafened(false);
        } catch (err) {
            console.error('Failed to join voice chat:', err);
            // Cleanup on failure
            if (localTrackRef.current) {
                localTrackRef.current.close();
                localTrackRef.current = null;
            }
            if (clientRef.current) {
                try { await clientRef.current.leave(); } catch { /* ignore */ }
                clientRef.current = null;
            }
        } finally {
            setIsConnecting(false);
        }
    }, [roomId, userId, token, isInVoice, isConnecting, highQualityAudio, handleUserPublished, handleUserUnpublished, handleUserLeft, handleVolumeIndicator, joinVoiceMutation, generateTokenAction]);

    const leaveVoice = useCallback(async () => {
        if (!isInVoice && !clientRef.current) return;

        try {
            // Disable and clean up denoiser processor
            if (denoiserProcessorRef.current) {
                try {
                    await denoiserProcessorRef.current.disable();
                } catch { /* ignore */ }
                denoiserProcessorRef.current = null;
            }

            // Unpipe and close local track
            if (localTrackRef.current) {
                localTrackRef.current.unpipe();
                localTrackRef.current.close();
                localTrackRef.current = null;
            }

            // Stop all remote tracks
            for (const [, remote] of remoteUsersRef.current) {
                if (remote.audioTrack) {
                    remote.audioTrack.stop();
                }
            }
            remoteUsersRef.current.clear();

            // Leave Agora channel
            if (clientRef.current) {
                clientRef.current.removeAllListeners();
                await clientRef.current.leave();
                clientRef.current = null;
            }

            // Clear UID mapping
            uidMapRef.current.clear();

            // Update Convex state
            if (token && roomId) {
                await leaveVoiceMutation({ token, roomId: roomId as any });
            }
        } catch (err) {
            console.error('Failed to leave voice chat:', err);
        } finally {
            setIsInVoice(false);
            setIsMuted(false);
            setIsDeafened(false);
            setIsNoiseSuppressed(false);
            setSpeakingUsers(new Set());
            setUserVolumes(new Map());
        }
    }, [isInVoice, token, roomId, leaveVoiceMutation]);

    const toggleMute = useCallback(() => {
        if (!localTrackRef.current || !isInVoice) return;

        const newMuted = !isMuted;
        localTrackRef.current.setEnabled(!newMuted);
        setIsMuted(newMuted);

        // Sync mute state to Convex
        if (token && roomId) {
            setMutedMutation({ token, roomId: roomId as any, isMuted: newMuted });
        }
    }, [isMuted, isInVoice, token, roomId, setMutedMutation]);

    const toggleDeafen = useCallback(() => {
        if (!isInVoice) return;

        const newDeafened = !isDeafened;

        if (newDeafened) {
            // Store current volumes before deafening
            const savedVolumes = new Map<string, number>();
            for (const [agoraUid, remote] of remoteUsersRef.current) {
                savedVolumes.set(agoraUid, remote.volume);
                if (remote.audioTrack) {
                    remote.audioTrack.setVolume(0);
                }
            }
            preDeafenVolumesRef.current = savedVolumes;
        } else {
            // Restore previous volumes
            for (const [agoraUid, remote] of remoteUsersRef.current) {
                const savedVol = preDeafenVolumesRef.current.get(agoraUid) ?? 100;
                remote.volume = savedVol;
                if (remote.audioTrack) {
                    remote.audioTrack.setVolume(savedVol);
                }
            }
            preDeafenVolumesRef.current.clear();
        }

        setIsDeafened(newDeafened);

        // Deafening also mutes you (Discord behavior)
        if (newDeafened && !isMuted) {
            localTrackRef.current?.setEnabled(false);
            setIsMuted(true);
            if (token && roomId) {
                setMutedMutation({ token, roomId: roomId as any, isMuted: true });
            }
        }
    }, [isDeafened, isInVoice, isMuted, token, roomId, setMutedMutation]);

    // Toggle AI Noise Suppression
    const toggleNoiseSuppression = useCallback(async () => {
        if (!isInVoice || !denoiserProcessorRef.current) return;

        const processor = denoiserProcessorRef.current;
        try {
            if (processor.enabled) {
                await processor.disable();
                setIsNoiseSuppressed(false);
                console.log('AI Noise Suppression disabled');
            } else {
                await processor.enable();
                // Set to NSNG mode (AI denoising) with soft level
                await processor.setMode(AIDenoiserProcessorMode.NSNG);
                await processor.setLevel(AIDenoiserProcessorLevel.SOFT);
                setIsNoiseSuppressed(true);
                console.log('AI Noise Suppression enabled');
            }
        } catch (err) {
            console.error('Failed to toggle noise suppression:', err);
        }
    }, [isInVoice]);

    // setUserVolume takes a Convex userId; we need to find the matching Agora UID
    const setUserVolume = useCallback((convexUserId: string, volume: number) => {
        const clamped = Math.max(0, Math.min(100, volume));

        // Find the Agora UID for this Convex user
        let targetAgoraUid: string | null = null;
        for (const [agoraUid, remote] of remoteUsersRef.current) {
            if (remote.convexUserId === convexUserId) {
                targetAgoraUid = agoraUid;
                break;
            }
        }

        if (targetAgoraUid) {
            const remote = remoteUsersRef.current.get(targetAgoraUid);
            if (remote) {
                remote.volume = clamped;
                if (remote.audioTrack && !isDeafenedRef.current) {
                    remote.audioTrack.setVolume(clamped);
                }
            }
        }

        setUserVolumes(prev => {
            const next = new Map(prev);
            next.set(convexUserId, clamped);
            return next;
        });
    }, []);

    // Build the UID map from voice members so we can resolve UIDs for users
    // who joined before us. We do this by computing their expected numeric UID.
    const voiceMembers = useRef<Array<{ userId: string }>>([]);
    const updateUidMap = useCallback((members: Array<{ userId: string }>) => {
        voiceMembers.current = members;
        for (const member of members) {
            const numericUid = stringToNumericUid(member.userId);
            uidMapRef.current.set(String(numericUid), member.userId);
        }
    }, []);

    // Expose updateUidMap - the VoiceChatPanel will call this
    // Actually, we'll use a useEffect that re-derives the map from Convex data
    // We need to import useQuery here but that's already available in VoiceChatPanel
    // Instead, let's derive it from voiceMembers in VoiceChatPanel via a prop callback
    // Simpler: just build the map from the voiceState query in this hook directly

    // Cleanup on unmount or when roomId changes
    useEffect(() => {
        return () => {
            if (denoiserProcessorRef.current) {
                try { denoiserProcessorRef.current.disable(); } catch { /* ignore */ }
                denoiserProcessorRef.current = null;
            }
            if (clientRef.current) {
                if (localTrackRef.current) {
                    localTrackRef.current.unpipe();
                    localTrackRef.current.close();
                }
                localTrackRef.current = null;
                for (const [, remote] of remoteUsersRef.current) {
                    remote.audioTrack?.stop();
                }
                remoteUsersRef.current.clear();
                clientRef.current.removeAllListeners();
                clientRef.current.leave().catch(() => { });
                clientRef.current = null;
                uidMapRef.current.clear();
            }
        };
    }, [roomId]);

    return {
        isInVoice,
        isConnecting,
        isMuted,
        isDeafened,
        isNoiseSuppressed,
        isNoiseSuppressionAvailable,
        speakingUsers,
        userVolumes,
        joinVoice,
        leaveVoice,
        toggleMute,
        toggleDeafen,
        toggleNoiseSuppression,
        setUserVolume,
        // Internal: allows VoiceChatPanel to keep UID map in sync
        _updateUidMap: updateUidMap,
    } as UseVoiceChatReturn & { _updateUidMap: (members: Array<{ userId: string }>) => void };
}
