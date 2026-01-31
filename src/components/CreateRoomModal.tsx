import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { searchMovies, TMDBMovie } from '../lib/tmdb';
import { useEffect, useRef } from 'react';

interface CreateRoomModalProps {
    onClose: () => void;
    initialMovieTitle?: string;
}

export function CreateRoomModal({ onClose, initialMovieTitle }: CreateRoomModalProps) {
    const [name, setName] = useState(initialMovieTitle ? `${initialMovieTitle} Room` : '');
    const [movieTitle, setMovieTitle] = useState(initialMovieTitle || '');
    const [movieFileName, setMovieFileName] = useState(initialMovieTitle || '');
    const [everyoneCanControl, setEveryoneCanControl] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [tmdbId, setTmdbId] = useState<number | undefined>();
    const [moviePoster, setMoviePoster] = useState<string | undefined>();
    const [suggestions, setSuggestions] = useState<TMDBMovie[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mediaType, setMediaType] = useState('.mp4');
    const suggestionRef = useRef<HTMLDivElement>(null);

    const mediaTypes = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv'];

    const { token } = useAuth();
    const navigate = useNavigate();
    const createRoomMutation = useMutation(api.rooms.createRoom);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (movieTitle.length >= 4) {
                const results = await searchMovies(movieTitle);
                setSuggestions(results.slice(0, 5));
                setShowSuggestions(true);
            } else {
                setSuggestions([]);
                setShowSuggestions(false);
            }
        };

        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [movieTitle]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectMovie = (movie: TMDBMovie) => {
        setMovieTitle(movie.title);
        setTmdbId(movie.id);
        setMoviePoster(movie.poster_path);
        setName(`${movie.title} Room`);
        setMovieFileName(movie.title);
        setShowSuggestions(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!token) {
            navigate('/login');
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const roomId = await createRoomMutation({
                token,
                name,
                movieTitle,
                movieFileName: `${movieFileName}${mediaType}`,
                tmdbId,
                moviePoster,
                isPublic: true,
                everyoneCanControl,
            });

            navigate(`/room/${roomId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create room');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Create a Room</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div className="toast error" style={{ position: 'static' }}>
                                {error}
                            </div>
                        )}

                        <div className="input-group" style={{ position: 'relative' }}>
                            <label htmlFor="movieTitle">Movie Title</label>
                            <input
                                type="text"
                                id="movieTitle"
                                className="input"
                                placeholder="Search for a movie..."
                                value={movieTitle}
                                onChange={(e) => setMovieTitle(e.target.value)}
                                onFocus={() => movieTitle.length >= 4 && setShowSuggestions(true)}
                                required
                                autoComplete="off"
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div
                                    ref={suggestionRef}
                                    className="dropdown-suggestions"
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        marginTop: '4px',
                                        zIndex: 1000,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                        maxHeight: '200px',
                                        overflowY: 'auto'
                                    }}
                                >
                                    {suggestions.map((movie) => (
                                        <div
                                            key={movie.id}
                                            className="suggestion-item"
                                            style={{
                                                padding: '10px 16px',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s',
                                                borderBottom: '1px solid var(--border)'
                                            }}
                                            onClick={() => handleSelectMovie(movie)}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{ fontWeight: 500 }}>{movie.title}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {movie.release_date ? movie.release_date.split('-')[0] : 'N/A'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="input-group">
                            <label htmlFor="roomName">Room Name</label>
                            <input
                                type="text"
                                id="roomName"
                                className="input"
                                placeholder="e.g., Movie Night with Friends"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label htmlFor="movieFileName">Movie File Name</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    id="movieFileName"
                                    className="input"
                                    style={{ flex: 1 }}
                                    placeholder="e.g., Inception.2010.1080p"
                                    value={movieFileName}
                                    onChange={(e) => setMovieFileName(e.target.value)}
                                    required
                                />
                                <select
                                    className="input"
                                    style={{ width: '100px', cursor: 'pointer' }}
                                    value={mediaType}
                                    onChange={(e) => setMediaType(e.target.value)}
                                >
                                    {mediaTypes.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                This filename will be used to verify that all viewers have the correct file
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label style={{ fontWeight: 500 }}>Shared Playback Control</label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Allow all viewers to play, pause, and seek the video
                                </p>
                            </div>
                            <div
                                className={`toggle ${everyoneCanControl ? 'active' : ''}`}
                                onClick={() => setEveryoneCanControl(!everyoneCanControl)}
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={isLoading}>
                            {isLoading ? <span className="spinner" /> : '🎬 Create Room'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
