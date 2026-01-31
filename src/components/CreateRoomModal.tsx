import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface CreateRoomModalProps {
    onClose: () => void;
}

export function CreateRoomModal({ onClose }: CreateRoomModalProps) {
    const [name, setName] = useState('');
    const [movieTitle, setMovieTitle] = useState('');
    const [movieFileName, setMovieFileName] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const { token } = useAuth();
    const navigate = useNavigate();
    const createRoomMutation = useMutation(api.rooms.createRoom);

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
                movieFileName,
                isPublic,
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
                            <label htmlFor="movieTitle">Movie Title</label>
                            <input
                                type="text"
                                id="movieTitle"
                                className="input"
                                placeholder="e.g., Inception"
                                value={movieTitle}
                                onChange={(e) => setMovieTitle(e.target.value)}
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label htmlFor="movieFileName">Movie File Name</label>
                            <input
                                type="text"
                                id="movieFileName"
                                className="input"
                                placeholder="e.g., Inception.2010.1080p.mp4"
                                value={movieFileName}
                                onChange={(e) => setMovieFileName(e.target.value)}
                                required
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                This filename will be used to verify that all viewers have the correct file
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <label style={{ fontWeight: 500 }}>Public Room</label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Anyone can find and join this room
                                </p>
                            </div>
                            <div
                                className={`toggle ${isPublic ? 'active' : ''}`}
                                onClick={() => setIsPublic(!isPublic)}
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
