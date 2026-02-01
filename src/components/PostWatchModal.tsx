import { useState } from 'react';
import letterboxdLogo from '../assets/letterboxd_logo.png';
import logo from '../assets/logo.png';
import { getImageUrl } from '../lib/tmdb';
import { StarRating } from './StarRating';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';

interface PostWatchModalProps {
    movieTitle: string;
    moviePoster?: string;
    tmdbId?: number;
    participants: string[];
    onClose: () => void;
}

export function PostWatchModal({ movieTitle, moviePoster, tmdbId, participants, onClose }: PostWatchModalProps) {
    const [rating, setRating] = useState(0);
    const [review, setReview] = useState('');
    const { token } = useAuth();
    const addWatchLog = useMutation(api.watchLogs.addWatchLog);

    const handleBackHome = async () => {
        if (token && rating > 0) {
            try {
                await addWatchLog({
                    token,
                    movieTitle,
                    moviePoster,
                    tmdbId,
                    rating,
                    review: review.trim() || undefined,
                    participants
                });
            } catch (err) {
                console.error("Failed to save watch log:", err);
            }
        }
        onClose();
    };

    const getLetterboxdLink = (title: string) => {
        // Spaces replaced with '-', special characters removed, lowercase
        const slug = title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove special characters (except spaces, words, and already present hyphens)
            .trim()
            .replace(/\s+/g, '-'); // Replace spaces with hyphens
        return `https://letterboxd.com/film/${slug}/`;
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
            <div className="modal" style={{
                textAlign: 'center',
                maxWidth: '440px',
                position: 'relative',
                overflow: 'hidden',
                padding: 0,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
            }}>
                {/* Background Poster with Overlay */}
                {moviePoster && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `url(${getImageUrl(moviePoster)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(2px) brightness(0.3)',
                        zIndex: -1,
                        opacity: 0.8
                    }} />
                )}

                {/* Visual Overlay for contrast */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(20,20,20,0.4) 0%, rgba(20,20,20,0.95) 100%)',
                    zIndex: -1
                }} />

                <div style={{ padding: '32px' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <img src={logo} alt="Absolute Cinema" style={{ height: '56px' }} />
                    </div>

                    <h2 className="modal-title" style={{ marginBottom: '16px', fontSize: '1.75rem', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                        That was absolute cinema!
                    </h2>

                    <p style={{
                        color: 'rgba(255,255,255,0.8)',
                        marginBottom: '24px',
                        fontSize: '1.1rem',
                        lineHeight: '1.5'
                    }}>
                        How would you rate <span style={{ color: '#fff', fontWeight: 700 }}>{movieTitle}</span>?
                    </p>

                    <div style={{ marginBottom: '24px' }}>
                        <StarRating rating={rating} onChange={setRating} />
                        {rating > 0 && (
                            <div style={{ marginTop: '8px', color: '#ffcc00', fontWeight: 700, fontSize: '1.2rem' }}>
                                {rating} / 5
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: '24px', textAlign: 'left' }}>
                        <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', marginBottom: '8px' }}>
                            Your Review (optional)
                        </label>
                        <textarea
                            className="input"
                            style={{
                                width: '100%',
                                minHeight: '100px',
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                color: '#fff',
                                padding: '12px',
                                fontSize: '0.95rem',
                                resize: 'none'
                            }}
                            placeholder="What did you think of the movie?"
                            value={review}
                            onChange={(e) => setReview(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <a
                            href={getLetterboxdLink(movieTitle)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{
                                width: '100%',
                                padding: '14px',
                                background: '#202428',
                                borderColor: '#444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px'
                            }}
                        >
                            <img
                                src={letterboxdLogo}
                                alt=""
                                style={{ height: '1.4em', width: 'auto' }}
                            />
                            Review on Letterboxd
                        </a>

                        <button
                            className="btn btn-primary"
                            onClick={handleBackHome}
                            style={{ width: '100%', padding: '14px' }}
                        >
                            Submit and Back Home
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
