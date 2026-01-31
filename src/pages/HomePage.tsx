import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { CreateRoomModal } from '../components/CreateRoomModal';
import type { Room } from '../types';

export function HomePage() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const { token, logout } = useAuth();
    const navigate = useNavigate();

    const publicRooms = useQuery(api.rooms.listPublicRooms);
    const myRooms = useQuery(api.rooms.listMyRooms, { token: token ?? undefined });
    const joinRoomMutation = useMutation(api.roomMembers.joinRoom);

    const handleJoinRoom = async (roomId: string) => {
        if (!token) {
            navigate('/login');
            return;
        }

        try {
            await joinRoomMutation({ token, roomId: roomId as any });
            navigate(`/room/${roomId}`);
        } catch (err) {
            console.error('Failed to join room:', err);
        }
    };

    const handleEnterRoom = (roomId: string) => {
        navigate(`/room/${roomId}`);
    };

    return (
        <div className="page">
            <Header onLogout={logout} />

            <div className="page-content">
                {/* Hero Section */}
                <section style={{ marginBottom: '48px', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
                        Watch Movies <span style={{ color: 'var(--primary)' }}>Together</span>
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
                        Create a room, invite your friends, and enjoy synchronized movie watching from anywhere.
                    </p>
                    <button
                        className="btn btn-primary"
                        style={{ marginTop: '24px', padding: '14px 32px', fontSize: '1rem' }}
                        onClick={() => setShowCreateModal(true)}
                    >
                        🎬 Create a Room
                    </button>
                </section>

                {/* My Rooms Section */}
                {myRooms && myRooms.length > 0 && (
                    <section style={{ marginBottom: '48px' }}>
                        <h2 style={{ marginBottom: '20px' }}>My Rooms</h2>
                        <div className="grid grid-cols-3">
                            {(myRooms as Room[]).map((room: Room) => (
                                <div
                                    key={room._id}
                                    className="room-card"
                                    onClick={() => handleEnterRoom(room._id)}
                                >
                                    <div className="room-card-header">
                                        <div>
                                            <h3 className="room-card-title">{room.name}</h3>
                                            <p className="room-card-movie">🎥 {room.movieTitle}</p>
                                        </div>
                                        <span className="room-card-badge">Admin</span>
                                    </div>
                                    <div className="room-card-footer">
                                        <div className="room-card-members">
                                            <span>👥</span>
                                            <span>{room.memberCount} members</span>
                                        </div>
                                        <span style={{ color: room.isPublic ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.875rem' }}>
                                            {room.isPublic ? '🌐 Public' : '🔒 Private'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Public Rooms Section */}
                <section>
                    <h2 style={{ marginBottom: '20px' }}>Public Rooms</h2>
                    {publicRooms && publicRooms.length > 0 ? (
                        <div className="grid grid-cols-3">
                            {(publicRooms as Room[]).map((room: Room) => (
                                <div
                                    key={room._id}
                                    className="room-card"
                                    onClick={() => handleJoinRoom(room._id)}
                                >
                                    <div className="room-card-header">
                                        <div>
                                            <h3 className="room-card-title">{room.name}</h3>
                                            <p className="room-card-movie">🎥 {room.movieTitle}</p>
                                        </div>
                                    </div>
                                    <div className="room-card-footer">
                                        <div className="room-card-members">
                                            <span>👥</span>
                                            <span>{room.memberCount} watching</span>
                                        </div>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                            by {room.adminName}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-state-icon">🎬</div>
                            <h3 className="empty-state-title">No public rooms yet</h3>
                            <p className="empty-state-text">
                                Be the first to create a room and invite your friends to watch together!
                            </p>
                        </div>
                    )}
                </section>
            </div>

            {showCreateModal && (
                <CreateRoomModal onClose={() => setShowCreateModal(false)} />
            )}
        </div>
    );
}
