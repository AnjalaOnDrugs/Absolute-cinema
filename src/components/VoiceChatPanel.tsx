import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { UseVoiceChatReturn } from '../hooks/useVoiceChat';
import type { VoiceMember } from '../types';
import type { Id } from '../../convex/_generated/dataModel';

interface VoiceChatPanelProps {
    roomId: string;
    currentUserId: string;
    voiceChat: UseVoiceChatReturn & { _updateUidMap?: (members: Array<{ userId: string }>) => void };
    isAdmin?: boolean;
    token?: string | null;
}

// Inline SVG icons
const MicIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
);

const MicOffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" y1="2" x2="22" y2="22" />
        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
        <path d="M5 10v2a7 7 0 0 0 12 5.29" />
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
        <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
);

const HeadphonesIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
);

const HeadphonesOffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
        <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        <path d="M21 18v-6a9 9 0 0 0-9-9 9 9 0 0 0-9 9v6" />
        <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.5" />
    </svg>
);

const PhoneIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
);

const DisconnectIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67" />
        <path d="M14.68 14.68a16 16 0 0 1-2.67-3.33A19.79 19.79 0 0 1 8.94 2.72 2 2 0 0 1 10.92 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11l-1.27 1.27" />
        <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
);

const NoiseSuppressionIcon = ({ active }: { active: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Shield shape */}
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        {/* Sound wave inside */}
        {active && (
            <>
                <path d="M9 12h0" strokeWidth="3" strokeLinecap="round" />
                <path d="M12 10v4" strokeWidth="2" strokeLinecap="round" />
                <path d="M15 11v2" strokeWidth="2" strokeLinecap="round" />
            </>
        )}
        {!active && (
            <line x1="9" y1="9" x2="15" y2="15" strokeWidth="2" />
        )}
    </svg>
);

export function VoiceChatPanel({ roomId, currentUserId, voiceChat, isAdmin, token }: VoiceChatPanelProps) {
    const {
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
    } = voiceChat;

    const updateUidMap = (voiceChat as any)._updateUidMap as ((members: Array<{ userId: string }>) => void) | undefined;

    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    // Query voice members from Convex for the member list
    const voiceMembers = useQuery(
        api.voiceState.getVoiceMembers,
        roomId ? { roomId: roomId as Id<"rooms"> } : "skip"
    );

    // Keep the UID map in sync whenever voice members change
    useEffect(() => {
        if (voiceMembers && updateUidMap) {
            updateUidMap(voiceMembers as Array<{ userId: string }>);
        }
    }, [voiceMembers, updateUidMap]);

    // HD Audio toggle (admin only)
    const room = useQuery(api.rooms.getRoom, { roomId: roomId as Id<"rooms"> });
    const toggleHQAudio = useMutation(api.rooms.toggleHighQualityAudio);
    const highQualityAudio = room?.highQualityAudio ?? false;

    const handleToggleHQAudio = async () => {
        if (!token || !isAdmin) return;
        try {
            await toggleHQAudio({
                token,
                roomId: roomId as Id<"rooms">,
                enabled: !highQualityAudio,
            });
        } catch (err) {
            console.error('Failed to toggle HD audio:', err);
        }
    };

    const handleCardClick = () => {
        if (!isInVoice && !isConnecting) {
            joinVoice();
        }
    };

    return (
        <div
            className={`voice-chat-panel ${!isInVoice ? 'voice-chat-panel--joinable' : ''}`}
            onClick={!isInVoice ? handleCardClick : undefined}
            style={{ cursor: !isInVoice ? 'pointer' : 'default' }}
        >
            <div className="voice-chat-header">
                <h3 className="voice-chat-title">
                    <PhoneIcon /> Voice Chat
                </h3>
                <span className="voice-chat-count">
                    {voiceMembers?.length || 0} in call
                </span>
            </div>

            {/* HD Audio toggle (admin only, only when in voice) */}
            {isAdmin && isInVoice && (
                <div className="voice-chat-hq-toggle" onClick={(e) => e.stopPropagation()}>
                    <div className="voice-chat-hq-info">
                        <span className="voice-chat-hq-label">🎧 HD Audio</span>
                        <span className="voice-chat-hq-desc">
                            {highQualityAudio ? '48kHz Stereo' : 'Standard'}
                        </span>
                    </div>
                    <button
                        className={`voice-chat-hq-switch ${highQualityAudio ? 'voice-chat-hq-switch--on' : ''}`}
                        onClick={handleToggleHQAudio}
                        title={highQualityAudio ? 'Disable HD Audio' : 'Enable HD Audio'}
                    >
                        <span className="voice-chat-hq-switch-knob" />
                    </button>
                </div>
            )}

            {/* Voice participant list — always visible */}
            <div className="voice-chat-users">
                {(voiceMembers as VoiceMember[] | undefined)?.length ? (
                    (voiceMembers as VoiceMember[]).map((member: VoiceMember) => {
                        const isSpeaking = speakingUsers.has(member.userId);
                        const isCurrentUser = member.userId === currentUserId;
                        const volume = userVolumes.get(member.userId) ?? 100;
                        const isExpanded = expandedUser === member.userId && !isCurrentUser;

                        return (
                            <div
                                key={member._id}
                                className={`voice-chat-user ${isSpeaking ? 'voice-chat-user--speaking' : ''}`}
                                onClick={(e) => {
                                    if (isInVoice && !isCurrentUser) {
                                        e.stopPropagation();
                                        setExpandedUser(
                                            expandedUser === member.userId ? null : member.userId
                                        );
                                    }
                                }}
                                style={{ cursor: isInVoice && !isCurrentUser ? 'pointer' : 'default' }}
                            >
                                <div className="voice-chat-user-row">
                                    <div className={`voice-chat-avatar ${isSpeaking ? 'voice-chat-avatar--speaking' : ''}`}>
                                        {member.profilePicture ? (
                                            <img
                                                src={member.profilePicture}
                                                alt={member.displayName}
                                            />
                                        ) : (
                                            member.displayName.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <span className="voice-chat-user-name">
                                        {member.displayName}
                                        {isCurrentUser && <span className="voice-chat-you"> (You)</span>}
                                    </span>
                                    {member.isMuted && (
                                        <span className="voice-chat-muted-icon">
                                            <MicOffIcon />
                                        </span>
                                    )}
                                </div>

                                {/* Volume slider for remote users (only when in voice) */}
                                {isInVoice && isExpanded && (
                                    <div
                                        className="voice-chat-volume-row"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                        </svg>
                                        <input
                                            type="range"
                                            className="voice-chat-volume"
                                            min="0"
                                            max="100"
                                            value={volume}
                                            onChange={(e) => setUserVolume(member.userId, Number(e.target.value))}
                                        />
                                        <span className="voice-chat-volume-label">{volume}%</span>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : null}
            </div>

            {/* Connecting indicator */}
            {!isInVoice && isConnecting && (
                <div className="voice-chat-join-hint">
                    Connecting...
                </div>
            )}

            {/* Controls — only when in voice */}
            {isInVoice && (
                <div className="voice-chat-controls" onClick={(e) => e.stopPropagation()}>
                    <button
                        className={`voice-chat-btn ${isMuted ? 'voice-chat-btn--active' : ''}`}
                        onClick={toggleMute}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? <MicOffIcon /> : <MicIcon />}
                    </button>
                    <button
                        className={`voice-chat-btn ${isDeafened ? 'voice-chat-btn--active' : ''}`}
                        onClick={toggleDeafen}
                        title={isDeafened ? 'Undeafen' : 'Deafen'}
                    >
                        {isDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
                    </button>
                    {isNoiseSuppressionAvailable && (
                        <button
                            className={`voice-chat-btn ${isNoiseSuppressed ? 'voice-chat-btn--noise-active' : ''}`}
                            onClick={toggleNoiseSuppression}
                            title={isNoiseSuppressed ? 'Disable Noise Suppression' : 'Enable Noise Suppression'}
                        >
                            <NoiseSuppressionIcon active={isNoiseSuppressed} />
                        </button>
                    )}
                    <button
                        className="voice-chat-btn voice-chat-btn--disconnect"
                        onClick={leaveVoice}
                        title="Disconnect"
                    >
                        <DisconnectIcon />
                    </button>
                </div>
            )}
        </div>
    );
}
