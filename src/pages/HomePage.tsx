import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import logo from '../assets/logo.png';
import roomsLogo from '../assets/rooms_logo.png';
import moviesLogo from '../assets/movies_logo.png';
import createRoomLogo from '../assets/create_room_logo.png';
import searchLogo from '../assets/search_logo.png';
import logsLogo from '../assets/logs_logo.png';
import { CreateRoomModal } from '../components/CreateRoomModal';
import { UserProfileModal } from '../components/UserProfileModal';
import { AddCustomMovieModal } from '../components/AddCustomMovieModal';
import { getPopularMovies, TMDBMovie, getImageUrl, searchMovies } from '../lib/tmdb';
import { useEffect } from 'react';

export function HomePage() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'rooms' | 'movies' | 'logs'>('rooms');
    const [popularMovies, setPopularMovies] = useState<TMDBMovie[]>([]);
    const [selectedMovieForRoom, setSelectedMovieForRoom] = useState<TMDBMovie | null>(null);
    const [movieSearchQuery, setMovieSearchQuery] = useState('');
    const [isSearchingMovies, setIsSearchingMovies] = useState(false);
    const [showAddMovieModal, setShowAddMovieModal] = useState(false);
    const [editingMovie, setEditingMovie] = useState<{ _id: string; title: string; poster?: string; year?: number; imdbScore?: number; overview?: string } | null>(null);
    const { token, logout, user } = useAuth();
    const navigate = useNavigate();

    const publicRooms = useQuery(api.rooms.listPublicRooms);
    const myRooms = useQuery(api.rooms.listMyRooms, { token: token ?? undefined });
    const joinRoomMutation = useMutation(api.roomMembers.joinRoom);
    const watchLogs = useQuery(api.watchLogs.getWatchLogs, { token: token ?? "" });
    const customMovies = useQuery(api.customMovies.listCustomMovies);
    const deleteCustomMovieMutation = useMutation(api.customMovies.deleteCustomMovie);
    const customMovieSearch = useQuery(
        api.customMovies.searchCustomMovies,
        movieSearchQuery.trim().length >= 2 ? { query: movieSearchQuery.trim() } : "skip"
    );

    useEffect(() => {
        const fetchMovies = async () => {
            if (activeTab !== 'movies' && movieSearchQuery === '') return;

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
    }, [movieSearchQuery, activeTab]);

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

    const handleStartRoomFromCustomMovie = (movie: { title: string; poster?: string }) => {
        setSelectedMovieForRoom({
            id: 0,
            title: movie.title,
            overview: '',
            poster_path: '',
            release_date: '',
            vote_average: 0,
        });
        setShowCreateModal(true);
    };

    return (
        <div className="page">
            <Header
                onLogout={logout}
                onProfileClick={() => user?._id && setSelectedUserId(user._id)}
            />

            <div className="page-content">
                {/* Modern Tabs Row */}
                <div className="home-tabs-container" style={{ marginBottom: '32px' }}>
                    <div className="home-tabs">
                        <button
                            className={`home-tab ${activeTab === 'rooms' ? 'active' : ''}`}
                            onClick={() => setActiveTab('rooms')}
                        >
                            <img src={roomsLogo} alt="" />
                            Rooms
                        </button>
                        <button
                            className={`home-tab ${activeTab === 'movies' ? 'active' : ''}`}
                            onClick={() => setActiveTab('movies')}
                        >
                            <img src={moviesLogo} alt="" />
                            Movies
                        </button>
                        <button
                            className={`home-tab ${activeTab === 'logs' ? 'active' : ''}`}
                            onClick={() => setActiveTab('logs')}
                        >
                            <img
                                src={logsLogo}
                                alt=""
                                style={{
                                    filter: activeTab === 'logs' ? 'brightness(0) invert(1)' : 'brightness(0) invert(0.7)'
                                }}
                            />
                            Watch Logs
                        </button>
                    </div>

                    <button
                        className="btn btn-primary home-create-btn"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <img src={createRoomLogo} alt="" style={{ height: '1.2em', marginRight: '8px', filter: 'brightness(0) invert(1)' }} />
                        Create Room
                    </button>
                </div>

                {/* Rooms Tab Content */}
                {activeTab === 'rooms' && (
                    <>
                        {myRooms && myRooms.length > 0 && (
                            <section style={{ marginBottom: '48px' }}>
                                <h2 style={{ marginBottom: '24px', fontSize: '1.5rem', fontWeight: 700 }}>Your Active Rooms</h2>
                                <div className="grid grid-cols-3" style={{ gap: '24px' }}>
                                    {myRooms.map((room) => (
                                        <div key={room._id} className={`room-card ${room.isPlaying ? 'room-card-playing' : ''}`} onClick={() => handleEnterRoom(room._id)}>
                                            {room.moviePoster && (
                                                <div
                                                    className="room-card-poster"
                                                    style={{ backgroundImage: `url(${getImageUrl(room.moviePoster)})` }}
                                                />
                                            )}
                                            {room.isPlaying && (
                                                <div className="room-card-playing-indicator">
                                                    <div className="playing-bar"></div>
                                                    <div className="playing-bar"></div>
                                                    <div className="playing-bar"></div>
                                                </div>
                                            )}
                                            <div className="room-card-content">
                                                <div className="room-card-header">
                                                    <h3 className="room-card-title">{room.name}</h3>
                                                    <span className="room-card-badge">Your Room</span>
                                                </div>
                                                <div className="room-card-body">
                                                    <p className="room-card-movie">
                                                        <img src={logo} alt="" style={{ height: '1em', marginRight: '4px', verticalAlign: 'middle', opacity: 0.7 }} />
                                                        {room.movieTitle}
                                                    </p>
                                                </div>
                                                <div className="room-card-footer">
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                                        {room.memberCount || 0} viewers
                                                    </span>
                                                    <button className="btn btn-primary btn-sm">Enter</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <section>
                            <h2 style={{ marginBottom: '24px', fontSize: '1.5rem', fontWeight: 700 }}>Explore Public Rooms</h2>
                            {publicRooms && publicRooms.length > 0 ? (
                                <div className="grid grid-cols-3" style={{ gap: '24px' }}>
                                    {publicRooms.map((room) => (
                                        <div key={room._id} className={`room-card ${room.isPlaying ? 'room-card-playing' : ''}`} onClick={() => handleJoinRoom(room._id)}>
                                            {room.moviePoster && (
                                                <div
                                                    className="room-card-poster"
                                                    style={{ backgroundImage: `url(${getImageUrl(room.moviePoster)})` }}
                                                />
                                            )}
                                            {room.isPlaying && (
                                                <div className="room-card-playing-indicator">
                                                    <div className="playing-bar"></div>
                                                    <div className="playing-bar"></div>
                                                    <div className="playing-bar"></div>
                                                </div>
                                            )}
                                            <div className="room-card-content">
                                                <div className="room-card-info">
                                                    <div className="room-card-header">
                                                        <h3 className="room-card-title">{room.name}</h3>
                                                    </div>
                                                    <div className="room-card-body">
                                                        <p className="room-card-movie">
                                                            <img src={logo} alt="" style={{ height: '1em', marginRight: '4px', verticalAlign: 'middle', opacity: 0.7 }} />
                                                            {room.movieTitle}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="room-card-footer">
                                                    <div className="room-card-members">
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                                            {room.memberCount || 0} viewers
                                                        </span>
                                                    </div>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                                        by {room.adminName}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <div className="empty-state-icon">
                                        <img src={logo} alt="" style={{ height: '64px', opacity: 0.5 }} />
                                    </div>
                                    <h3 className="empty-state-title">No public rooms yet</h3>
                                    <p className="empty-state-text">
                                        Be the first to create a room and invite your friends!
                                    </p>
                                </div>
                            )}
                        </section>
                    </>
                )}

                {/* Movies Tab Content */}
                {activeTab === 'movies' && (
                    <section>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0 }}>{movieSearchQuery ? 'Search Results' : 'Popular Movies'}</h2>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowAddMovieModal(true)}
                                    style={{ whiteSpace: 'nowrap' }}
                                >
                                    + Add Custom Movie
                                </button>
                                <div style={{ position: 'relative', width: '300px' }}>
                                    <input
                                        type="text"
                                        placeholder="Search movies..."
                                        value={movieSearchQuery}
                                        onChange={(e) => setMovieSearchQuery(e.target.value)}
                                        className="input"
                                        style={{ paddingLeft: '40px' }}
                                    />
                                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                        <img src={searchLogo} alt="" style={{ height: '16px', width: '16px', filter: 'brightness(0) invert(0.7)' }} />
                                    </span>
                                    {isSearchingMovies && (
                                        <div className="spinner" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px' }} />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Custom Movies Section */}
                        {(() => {
                            const displayCustomMovies = movieSearchQuery.trim().length >= 2
                                ? (customMovieSearch || [])
                                : (customMovies || []);
                            return displayCustomMovies.length > 0 ? (
                                <div style={{ marginBottom: '40px' }}>
                                    <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        Custom Movies
                                    </h3>
                                    <div className="grid grid-cols-4" style={{ gap: '24px' }}>
                                        {displayCustomMovies.map((movie) => (
                                            <div key={movie._id} className="room-card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => handleStartRoomFromCustomMovie(movie)}>
                                                <div style={{ position: 'relative', paddingTop: '150%' }}>
                                                    <img
                                                        src={movie.poster || 'https://via.placeholder.com/500x750?text=No+Poster'}
                                                        alt={movie.title}
                                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--primary)' }}>
                                                        Custom
                                                    </div>
                                                    {user && movie.addedBy === user._id && (
                                                        <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '4px' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: 'auto', background: 'rgba(0,0,0,0.7)', border: 'none' }}
                                                                onClick={(e) => { e.stopPropagation(); setEditingMovie(movie); }}
                                                                title="Edit movie"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: 'auto', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#ff4444' }}
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (!token) return;
                                                                    if (confirm(`Delete "${movie.title}"?`)) {
                                                                        try {
                                                                            await deleteCustomMovieMutation({ token, movieId: movie._id as any });
                                                                        } catch (err) {
                                                                            console.error('Failed to delete movie:', err);
                                                                        }
                                                                    }
                                                                }}
                                                                title="Delete movie"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.9))', padding: '20px' }}>
                                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{movie.title}</h3>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                                                            {movie.imdbScore !== undefined && (
                                                                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>IMDb {movie.imdbScore.toFixed(1)}</span>
                                                            )}
                                                            {movie.year && (
                                                                <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{movie.year}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ padding: '16px', background: 'var(--bg-secondary)' }}>
                                                    <button className="btn btn-primary" style={{ width: '100%', padding: '8px' }}>
                                                        Start Room
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null;
                        })()}

                        {/* TMDB Movies */}
                        <div>
                            {(movieSearchQuery.trim().length >= 2 && (customMovieSearch || []).length > 0) && (
                                <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    From TMDB
                                </h3>
                            )}
                            <div className="grid grid-cols-4" style={{ gap: '24px' }}>
                                {popularMovies.map((movie) => (
                                    <div key={movie.id} className="room-card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => handleStartRoomFromMovie(movie)}>
                                        <div style={{ position: 'relative', paddingTop: '150%' }}>
                                            <img src={getImageUrl(movie.poster_path)} alt={movie.title} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.9))', padding: '20px' }}>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{movie.title}</h3>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                                                    <span style={{ color: 'var(--primary)', fontWeight: 600 }}>IMDb {movie.vote_average.toFixed(1)}</span>
                                                    <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{movie.release_date?.split('-')[0]}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ padding: '16px', background: 'var(--bg-secondary)' }}>
                                            <button className="btn btn-primary" style={{ width: '100%', padding: '8px' }}>
                                                Start Room
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {/* Watch Logs Tab Content */}
                {activeTab === 'logs' && (
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>Your Watch History</h2>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{watchLogs?.length || 0} movies watched</span>
                        </div>

                        {!watchLogs || watchLogs.length === 0 ? (
                            <div className="logs-empty">
                                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🍿</div>
                                <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No watch logs yet</h3>
                                <p style={{ color: 'var(--text-secondary)' }}>Your finished watch parties will appear here.</p>
                            </div>
                        ) : (
                            watchLogs.map((log) => (
                                <div key={log._id} className="watch-log-card">
                                    {log.moviePoster && (
                                        <img src={getImageUrl(log.moviePoster)} alt={log.movieTitle} className="watch-log-poster" />
                                    )}
                                    <div className="watch-log-content">
                                        <div className="watch-log-header">
                                            <h3 className="watch-log-title">{log.movieTitle}</h3>
                                            <span className="watch-log-date">
                                                {new Date(log.watchedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        </div>
                                        <div className="watch-log-meta">
                                            <div className="watch-log-rating">★ {log.rating}</div>
                                            <div style={{ color: 'var(--text-muted)' }}>•</div>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                                {log.participants.length} participant{log.participants.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        {log.review && (
                                            <div style={{
                                                marginTop: '12px',
                                                fontStyle: 'italic',
                                                fontSize: '0.9rem',
                                                color: 'rgba(255,255,255,0.7)',
                                                background: 'rgba(0,0,0,0.2)',
                                                padding: '8px 12px',
                                                borderRadius: '6px'
                                            }}>
                                                "{log.review}"
                                            </div>
                                        )}
                                        <div className="watch-log-participants" style={{ marginTop: '12px' }}>
                                            {log.participants.map((name, i) => (
                                                <span key={i} className="participant-tag">{name}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
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

            {selectedUserId && (
                <UserProfileModal
                    userId={selectedUserId}
                    onClose={() => setSelectedUserId(null)}
                />
            )}

            {showAddMovieModal && (
                <AddCustomMovieModal
                    onClose={() => setShowAddMovieModal(false)}
                />
            )}

            {editingMovie && (
                <AddCustomMovieModal
                    editMovie={editingMovie}
                    onClose={() => setEditingMovie(null)}
                />
            )}
        </div>
    );
}
