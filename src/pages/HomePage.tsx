import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { CreateRoomModal } from '../components/CreateRoomModal';
import type { Room } from '../types';
import { getPopularMovies, TMDBMovie, getImageUrl, searchMovies } from '../lib/tmdb';
import { useEffect } from 'react';

export function HomePage() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'rooms' | 'movies'>('rooms');
    const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
    const [selectedMovieForRoom, setSelectedMovieForRoom] = useState<TMDBMovie | null>(null);
    const [movieSearchQuery, setMovieSearchQuery] = useState('');
    const [isSearchingMovies, setIsSearchingMovies] = useState(false);
    const { token, logout } = useAuth();
    const navigate = useNavigate();

    const publicRooms = useQuery(api.rooms.listPublicRooms);
    const myRooms = useQuery(api.rooms.listMyRooms, { token: token ?? undefined });
    const joinRoomMutation = useMutation(api.roomMembers.joinRoom);

    useEffect(() => {
        const fetchMovies = async () => {
            if (movieSearchQuery.trim().length >= 3) {
                setIsSearchingMovies(true);
                const results = await searchMovies(movieSearchQuery);
                setPopularMovies(results);
                setIsSearchingMovies(false);
            } else if (movieSearchQuery.trim().length === 0) {
                const movies = await getPopularMovies();
                setPopularMovies(movies);
            }
        };
        const timer = setTimeout(fetchMovies, 500);
        return () => clearTimeout(timer);
    }, [movieSearchQuery]);

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

    const handleStartRoomFromMovie = (movie: TMDBMovie) => {
        setSelectedMovieForRoom(movie);
        setShowCreateModal(true);
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

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    gap: '24px',
                    marginBottom: '32px',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '12px'
                }}>
                    <button
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: '8px 16px',
                            color: activeTab === 'rooms' ? 'var(--primary)' : 'var(--text-secondary)',
                            borderBottom: activeTab === 'rooms' ? '2px solid var(--primary)' : 'none',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '1.1rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => activeTab !== 'rooms' && (e.currentTarget.style.color = 'var(--text-primary)')}
                        onMouseLeave={(e) => activeTab !== 'rooms' && (e.currentTarget.style.color = 'var(--text-secondary)')}
                        onClick={() => setActiveTab('rooms')}
                    >
                        Rooms
                    </button>
                    <button
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: '8px 16px',
                            color: activeTab === 'movies' ? 'var(--primary)' : 'var(--text-secondary)',
                            borderBottom: activeTab === 'movies' ? '2px solid var(--primary)' : 'none',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '1.1rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => activeTab !== 'movies' && (e.currentTarget.style.color = 'var(--text-primary)')}
                        onMouseLeave={(e) => activeTab !== 'movies' && (e.currentTarget.style.color = 'var(--text-secondary)')}
                        onClick={() => setActiveTab('movies')}
                    >
                        Movies
                    </button>
                </div>

                {activeTab === 'rooms' ? (
                    <>
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
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* All Rooms Section */}
                        <section>
                            <h2 style={{ marginBottom: '20px' }}>Available Rooms</h2>
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
                    </>
                ) : (
                    <section>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '24px'
                        }}>
                            <h2 style={{ margin: 0 }}>{movieSearchQuery ? 'Search Results' : 'Popular Movies'}</h2>
                            <div style={{ position: 'relative', width: '300px' }}>
                                <input
                                    type="text"
                                    placeholder="Search movies..."
                                    value={movieSearchQuery}
                                    onChange={(e) => setMovieSearchQuery(e.target.value)}
                                    className="input"
                                    style={{ paddingLeft: '40px' }}
                                />
                                <span style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--text-muted)'
                                }}>🔍</span>
                                {isSearchingMovies && (
                                    <div className="spinner" style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '16px',
                                        height: '16px'
                                    }} />
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-4" style={{ gap: '24px' }}>
                            {popularMovies.map((movie) => (
                                <div
                                    key={movie.id}
                                    className="room-card"
                                    style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
                                    onClick={() => handleStartRoomFromMovie(movie)}
                                >
                                    <div style={{ position: 'relative', paddingTop: '150%' }}>
                                        <img
                                            src={getImageUrl(movie.poster_path)}
                                            alt={movie.title}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover'
                                            }}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: 0,
                                            right: 0,
                                            background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
                                            padding: '20px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'flex-end'
                                        }}>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{movie.title}</h3>
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginTop: '8px'
                                            }}>
                                                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>⭐ {movie.vote_average.toFixed(1)}</span>
                                                <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{movie.release_date?.split('-')[0]}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '16px', background: 'var(--bg-secondary)' }}>
                                        <button
                                            className="btn btn-primary"
                                            style={{ width: '100%', padding: '8px' }}
                                        >
                                            🎬 Start Room
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>

            {showCreateModal && (
                <CreateRoomModal
                    onClose={() => {
                        setShowCreateModal(false);
                        setSelectedMovieForRoom(null);
                    }}
                    initialMovieTitle={selectedMovieForRoom?.title}
                />
            )}
        </div>
    );
}
