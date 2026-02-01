import { useState, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import logo from '../assets/logo.png';

// Resize and compress image to base64
async function resizeImage(file: File, maxSize: number = 128): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = maxSize;
                canvas.height = maxSize;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }
                // Draw image centered and cropped to square
                const size = Math.min(img.width, img.height);
                const x = (img.width - size) / 2;
                const y = (img.height - size) / 2;
                ctx.drawImage(img, x, y, size, size, 0, 0, maxSize, maxSize);
                // Convert to JPEG with compression
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Map Convex error messages to user-friendly messages
function mapErrorMessage(error: string): string {
    if (error.includes('Email already registered')) {
        return 'An account with this email already exists.';
    }
    if (error.includes('Username already taken')) {
        return 'This username is already in use. Please choose another.';
    }
    return 'Registration failed. Please try again.';
}

export function RegisterPage() {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profilePicture, setProfilePicture] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const registerMutation = useMutation(api.users.register);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleProfilePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const resized = await resizeImage(file);
                setProfilePicture(resized);
            } catch (err) {
                console.error('Failed to process image:', err);
                setError('Failed to process image. Please try another.');
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setIsLoading(true);

        try {
            const result = await registerMutation({
                username,
                email,
                password,
                displayName: displayName || username,
                profilePicture: profilePicture || undefined,
            });

            login(result.token, result.user);

            navigate('/');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Registration failed';
            setError(mapErrorMessage(errorMessage));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1 className="auth-title">
                        <img src={logo} alt="Absolute Cinema" className="auth-logo-img" />
                        Absolute Cinema
                    </h1>
                    <p className="auth-subtitle">Create your account</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="toast error" style={{ position: 'static' }}>
                            {error}
                        </div>
                    )}

                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            className="input"
                            placeholder="Choose a username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="displayName">Display Name</label>
                        <input
                            type="text"
                            id="displayName"
                            className="input"
                            placeholder="How should we call you?"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                    </div>

                    <div className="input-group">
                        <label>Profile Picture (optional)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div
                                className="avatar"
                                style={{
                                    width: '64px',
                                    height: '64px',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    flexShrink: 0
                                }}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {profilePicture ? (
                                    <img
                                        src={profilePicture}
                                        alt="Profile preview"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    displayName?.charAt(0).toUpperCase() || username?.charAt(0).toUpperCase() || '?'
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ marginBottom: '4px' }}
                                >
                                    📷 Choose Photo
                                </button>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Click avatar or button to upload
                                </p>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleProfilePictureChange}
                                style={{ display: 'none' }}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <input
                            type="email"
                            id="email"
                            className="input"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            className="input"
                            placeholder="Create a password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            className="input"
                            placeholder="Confirm your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isLoading}
                        style={{ width: '100%', marginTop: '8px' }}
                    >
                        {isLoading ? <span className="spinner" /> : 'Create Account'}
                    </button>
                </form>

                <div className="auth-footer">
                    Already have an account?{' '}
                    <Link to="/login">Sign in</Link>
                </div>
            </div>
        </div>
    );
}
