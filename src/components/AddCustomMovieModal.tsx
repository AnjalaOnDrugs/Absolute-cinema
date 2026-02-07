import { useState, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';

interface CustomMovieData {
    _id: string;
    title: string;
    poster?: string;
    year?: number;
    imdbScore?: number;
    overview?: string;
}

interface AddCustomMovieModalProps {
    onClose: () => void;
    onMovieAdded?: () => void;
    initialTitle?: string;
    editMovie?: CustomMovieData;
}

// Resize image to poster dimensions (2:3 aspect ratio), returns base64 JPEG
async function resizePosterImage(file: File, maxWidth: number = 300): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxHeight = Math.round(maxWidth * 1.5); // 2:3 aspect ratio
                canvas.width = maxWidth;
                canvas.height = maxHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }
                // Fill with black background
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, maxWidth, maxHeight);
                // Scale image to cover the canvas while maintaining aspect ratio
                const scale = Math.max(maxWidth / img.width, maxHeight / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                const x = (maxWidth - scaledWidth) / 2;
                const y = (maxHeight - scaledHeight) / 2;
                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function AddCustomMovieModal({ onClose, onMovieAdded, initialTitle, editMovie }: AddCustomMovieModalProps) {
    const [title, setTitle] = useState(editMovie?.title || initialTitle || '');
    const [poster, setPoster] = useState(editMovie?.poster || '');
    const [year, setYear] = useState(editMovie?.year?.toString() || '');
    const [imdbScore, setImdbScore] = useState(editMovie?.imdbScore?.toString() || '');
    const [overview, setOverview] = useState(editMovie?.overview || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { token } = useAuth();
    const addCustomMovie = useMutation(api.customMovies.addCustomMovie);
    const updateCustomMovie = useMutation(api.customMovies.updateCustomMovie);

    const isEditing = !!editMovie;

    const handlePosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setError('Image must be under 10MB');
            return;
        }

        try {
            const base64 = await resizePosterImage(file);
            setPoster(base64);
            setError('');
        } catch {
            setError('Failed to process image');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!token) return;
        if (!title.trim()) {
            setError('Movie name is required');
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const parsedYear = year ? parseInt(year, 10) : undefined;
            if (parsedYear !== undefined && (isNaN(parsedYear) || parsedYear < 1888 || parsedYear > new Date().getFullYear() + 5)) {
                setError('Please enter a valid year');
                setIsLoading(false);
                return;
            }

            const parsedScore = imdbScore ? parseFloat(imdbScore) : undefined;
            if (parsedScore !== undefined && (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10)) {
                setError('IMDb score must be between 0 and 10');
                setIsLoading(false);
                return;
            }

            if (isEditing) {
                await updateCustomMovie({
                    token,
                    movieId: editMovie._id as any,
                    title: title.trim(),
                    poster: poster || undefined,
                    year: parsedYear,
                    imdbScore: parsedScore,
                    overview: overview.trim() || undefined,
                });
            } else {
                await addCustomMovie({
                    token,
                    title: title.trim(),
                    poster: poster || undefined,
                    year: parsedYear,
                    imdbScore: parsedScore,
                    overview: overview.trim() || undefined,
                });
            }

            onMovieAdded?.();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : isEditing ? 'Failed to update movie' : 'Failed to add movie');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{isEditing ? 'Edit Custom Movie' : 'Add Custom Movie'}</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {error && (
                            <div className="toast error" style={{ position: 'static' }}>
                                {error}
                            </div>
                        )}

                        <div className="input-group">
                            <label htmlFor="customMovieTitle">Movie Name *</label>
                            <input
                                type="text"
                                id="customMovieTitle"
                                className="input"
                                placeholder="Enter movie name"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <div className="input-group">
                            <label>Movie Poster</label>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        width: '100px',
                                        height: '150px',
                                        borderRadius: '8px',
                                        border: '2px dashed var(--border)',
                                        cursor: 'pointer',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: poster ? 'none' : 'var(--bg-tertiary)',
                                        transition: 'border-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                                >
                                    {poster ? (
                                        <img
                                            src={poster}
                                            alt="Poster preview"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', padding: '8px' }}>
                                            Click to upload
                                        </div>
                                    )}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{ marginBottom: '8px' }}
                                    >
                                        {poster ? 'Change Poster' : 'Upload Poster'}
                                    </button>
                                    {poster && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => setPoster('')}
                                            style={{ marginLeft: '8px', marginBottom: '8px', color: '#ff4444' }}
                                        >
                                            Remove
                                        </button>
                                    )}
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                                        Upload a poster image (optional). Will be resized to fit.
                                    </p>
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handlePosterUpload}
                                style={{ display: 'none' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label htmlFor="customMovieYear">Year Released</label>
                                <input
                                    type="number"
                                    id="customMovieYear"
                                    className="input"
                                    placeholder="e.g. 2024"
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    min="1888"
                                    max={new Date().getFullYear() + 5}
                                />
                            </div>

                            <div className="input-group" style={{ flex: 1 }}>
                                <label htmlFor="customMovieScore">IMDb Score</label>
                                <input
                                    type="number"
                                    id="customMovieScore"
                                    className="input"
                                    placeholder="e.g. 7.5"
                                    value={imdbScore}
                                    onChange={(e) => setImdbScore(e.target.value)}
                                    min="0"
                                    max="10"
                                    step="0.1"
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label htmlFor="customMovieOverview">Description</label>
                            <textarea
                                id="customMovieOverview"
                                className="input"
                                placeholder="Brief description of the movie (optional)"
                                value={overview}
                                onChange={(e) => setOverview(e.target.value)}
                                rows={3}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={isLoading}>
                            {isLoading ? <span className="spinner" /> : isEditing ? 'Save Changes' : 'Add Movie'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
