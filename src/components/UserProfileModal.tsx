import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getImageUrl } from '../lib/tmdb';
import { StarRating } from './StarRating';

interface UserProfileModalProps {
    userId: string;
    onClose: () => void;
}

export function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
    // We need a way to get user info by ID. Let's assume we have or will add this.
    const userProfile = useQuery(api.users.getUserById, { userId: userId as any });
    const watchLogs = useQuery(api.watchLogs.getWatchLogsByUser, { userId: userId as any });

    if (!userProfile) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
            <div className="modal" style={{
                maxWidth: '600px',
                width: '90%',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>
                {/* Header / Profile Info */}
                <div style={{
                    padding: '32px',
                    background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '24px'
                }}>
                    <div className="avatar" style={{ width: '80px', height: '80px', fontSize: '2rem' }}>
                        {userProfile.profilePicture ? (
                            <img
                                src={userProfile.profilePicture}
                                alt={userProfile.displayName}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        ) : (
                            userProfile.displayName.charAt(0).toUpperCase()
                        )}
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{userProfile.displayName}</h2>
                        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>@{userProfile.username}</p>
                        <div style={{ marginTop: '12px', display: 'flex', gap: '16px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{watchLogs?.length || 0}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Movies</div>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            marginLeft: 'auto',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            padding: '4px'
                        }}
                    >
                        &times;
                    </button>
                </div>

                {/* Watch Logs */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Watch History & Reviews</h3>

                    {!watchLogs || watchLogs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                            No movies watched yet.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {watchLogs.map((log) => (
                                <div key={log._id} style={{
                                    display: 'flex',
                                    gap: '20px',
                                    background: 'rgba(255,255,255,0.03)',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    {log.moviePoster && (
                                        <img
                                            src={getImageUrl(log.moviePoster)}
                                            alt={log.movieTitle}
                                            style={{ width: '80px', height: '120px', borderRadius: '8px', objectFit: 'cover' }}
                                        />
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{log.movieTitle}</h4>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {new Date(log.watchedAt).toLocaleDateString()}
                                            </span>
                                        </div>

                                        <div style={{ marginBottom: '12px' }}>
                                            <StarRating rating={log.rating} onChange={() => { }} />
                                        </div>

                                        {log.review && (
                                            <div style={{
                                                fontStyle: 'italic',
                                                color: 'rgba(255,255,255,0.8)',
                                                fontSize: '0.95rem',
                                                lineHeight: '1.4',
                                                background: 'rgba(0,0,0,0.2)',
                                                padding: '12px',
                                                borderRadius: '8px',
                                                marginTop: '8px'
                                            }}>
                                                "{log.review}"
                                            </div>
                                        )}

                                        <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            Watched with: {log.participants.join(', ')}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
