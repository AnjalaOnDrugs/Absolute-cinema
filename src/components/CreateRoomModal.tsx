import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { searchMovies, TMDBMovie } from '../lib/tmdb';
import { useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { AddCustomMovieModal } from './AddCustomMovieModal';

interface CreateRoomModalProps {
    onClose: () => void;
    initialMovieTitle?: string;
}

export function CreateRoomModal({ onClose, initialMovieTitle }: CreateRoomModalProps) {
    const [name, setName] = useState(initialMovieTitle ? `${initialMovieTitle} Room` : '');
    const [movieTitle, setMovieTitle] = useState(initialMovieTitle || '');
    const [movieFileName, setMovieFileName] = useState('');
    const [everyoneCanControl, setEveryoneCanControl] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [tmdbId, setTmdbId] = useState<number | undefined>();
    const [moviePoster, setMoviePoster] = useState<string | undefined>();
    const [suggestions, setSuggestions] = useState<TMDBMovie[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mediaType, setMediaType] = useState('.mp4');
    const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
    const [showAddCustomMovie, setShowAddCustomMovie] = useState(false);
    const suggestionRef = useRef<HTMLDivElement>(null);

    const mediaTypes = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv'];

    const { token } = useAuth();
    const navigate = useNavigate();
    const createRoomMutation = useMutation(api.rooms.createRoom);
    const customMovieResults = useQuery(
        api.customMovies.searchCustomMovies,
        movieTitle.length >= 2 ? { query: movieTitle } : "skip"
    );

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (movieTitle.length >= 4) {
                const results = await searchMovies(movieTitle);
                setSuggestions(results.slice(0, 5));
                setShowSuggestions(true);
            } else if (movieTitle.length >= 2) {
                setSuggestions([]);
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
                localFilePath: selectedFilePath || undefined,
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
                                onFocus={() => movieTitle.length >= 2 && setShowSuggestions(true)}
                                required
                                autoComplete="off"
                            />
                            {showSuggestions && (suggestions.length > 0 || (customMovieResults && customMovieResults.length > 0) || movieTitle.length >= 2) && (
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
                                        maxHeight: '280px',
                                        overflowY: 'auto'
                                    }}
                                >
                                    {customMovieResults && customMovieResults.length > 0 && (
                                        <>
                                            <div style={{ padding: '6px 16px', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Custom Movies
                                            </div>
                                            {customMovieResults.map((movie) => (
                                                <div
                                                    key={movie._id}
                                                    className="suggestion-item"
                                                    style={{
                                                        padding: '10px 16px',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.2s',
                                                        borderBottom: '1px solid var(--border)'
                                                    }}
                                                    onClick={() => {
                                                        setMovieTitle(movie.title);
                                                        setTmdbId(undefined);
                                                        setMoviePoster(movie.poster || undefined);
                                                        setName(`${movie.title} Room`);
                                                        setShowSuggestions(false);
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontWeight: 500 }}>{movie.title}</div>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--primary)', background: 'rgba(var(--primary-rgb, 255,255,255), 0.1)', padding: '1px 6px', borderRadius: '4px' }}>Custom</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        {movie.year || 'N/A'}{movie.imdbScore !== undefined ? ` · IMDb ${movie.imdbScore}` : ''}
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {suggestions.length > 0 && (
                                        <>
                                            {customMovieResults && customMovieResults.length > 0 && (
                                                <div style={{ padding: '6px 16px', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    From TMDB
                                                </div>
                                            )}
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
                                        </>
                                    )}
                                    <div
                                        style={{
                                            padding: '10px 16px',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s',
                                            color: 'var(--primary)',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                        }}
                                        onClick={() => {
                                            setShowSuggestions(false);
                                            setShowAddCustomMovie(true);
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        + Add "{movieTitle}" as custom movie
                                    </div>
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
                            <label htmlFor="movieFileName">Movie File Selection</label>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={async () => {
                                        try {
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

                                                setSelectedFilePath(filePath);

                                                // Extract filename and extension
                                                const parts = filePath.split(/[\\/]/);
                                                const fullFileName = parts[parts.length - 1];
                                                const lastDotIndex = fullFileName.lastIndexOf('.');

                                                if (lastDotIndex !== -1) {
                                                    const namePart = fullFileName.substring(0, lastDotIndex);
                                                    const extPart = fullFileName.substring(lastDotIndex);
                                                    setMovieFileName(namePart);
                                                    if (mediaTypes.includes(extPart)) {
                                                        setMediaType(extPart);
                                                    }
                                                } else {
                                                    setMovieFileName(fullFileName);
                                                }
                                            }
                                        } catch (err) {
                                            console.error('Failed to select file:', err);
                                        }
                                    }}
                                    style={{ flexShrink: 0 }}
                                >
                                    {selectedFilePath ? '📁 Change File' : '📁 Select Movie File'}
                                </button>
                                {selectedFilePath && (
                                    <div style={{
                                        flex: 1,
                                        padding: '10px 14px',
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderRadius: '8px',
                                        fontSize: '0.875rem',
                                        color: 'var(--text-primary)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        border: '1px solid var(--border)'
                                    }}>
                                        {selectedFilePath}
                                    </div>
                                )}
                            </div>

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
                                {selectedFilePath
                                    ? "File name and type extracted from selected file. You can adjust them if needed."
                                    : "This filename will be used to verify that all viewers have the correct file."}
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
                            {isLoading ? <span className="spinner" /> : (
                                <>
                                    <img src={logo} alt="" style={{ height: '1.2em', marginRight: '8px', verticalAlign: 'middle' }} />
                                    Create Room
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {showAddCustomMovie && (
                <AddCustomMovieModal
                    initialTitle={movieTitle}
                    onClose={() => setShowAddCustomMovie(false)}
                    onMovieAdded={() => {
                        setShowAddCustomMovie(false);
                    }}
                />
            )}
        </div>
    );
}
