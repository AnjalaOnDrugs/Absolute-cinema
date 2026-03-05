import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

interface HeaderProps {
    onLogout: () => void;
    onProfileClick?: () => void;
    onDownloadClick?: () => void;
    activeDownloads?: number;
    completedDownloads?: number;
}

export function Header({ onLogout, onProfileClick, onDownloadClick, activeDownloads = 0, completedDownloads = 0 }: HeaderProps) {
    const { user, token } = useAuth();

    const hasActive = activeDownloads > 0;
    const hasCompleted = completedDownloads > 0 && !hasActive;
    const totalCount = activeDownloads + completedDownloads;

    return (
        <header className="header">
            <Link to="/" className="header-logo">
                <img src={logo} alt="Absolute Cinema" className="header-logo-img" />
                <h1>Absolute Cinema</h1>
            </Link>

            <div className="header-nav">
                {token && user ? (
                    <>
                        {/* Download indicator icon */}
                        <button
                            className={`header-download-btn ${hasActive ? 'downloading' : ''} ${hasCompleted ? 'completed' : ''}`}
                            onClick={onDownloadClick}
                            title="Downloads"
                            type="button"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {totalCount > 0 && (
                                <span className={`header-download-badge ${hasActive ? 'active' : ''} ${hasCompleted ? 'done' : ''}`}>
                                    {hasCompleted ? '✓' : totalCount}
                                </span>
                            )}
                        </button>

                        <div
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: onProfileClick ? 'pointer' : 'default' }}
                            onClick={onProfileClick}
                        >
                            <div className="avatar" style={{ overflow: 'hidden' }}>
                                {user.profilePicture ? (
                                    <img
                                        src={user.profilePicture}
                                        alt={user.displayName}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    user.displayName?.charAt(0).toUpperCase() || 'U'
                                )}
                            </div>
                            <span style={{ color: 'var(--text-secondary)' }}>
                                {user.displayName}
                            </span>
                        </div>
                        <button className="btn btn-ghost" onClick={onLogout}>
                            Logout
                        </button>
                    </>
                ) : (
                    <>
                        <Link to="/login" className="btn btn-ghost">
                            Login
                        </Link>
                        <Link to="/register" className="btn btn-primary">
                            Sign Up
                        </Link>
                    </>
                )}
            </div>
        </header>
    );
}

