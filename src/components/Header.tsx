import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

interface HeaderProps {
    onLogout: () => void;
    onProfileClick?: () => void;
}

export function Header({ onLogout, onProfileClick }: HeaderProps) {
    const { user, token } = useAuth();

    return (
        <header className="header">
            <Link to="/" className="header-logo">
                <img src={logo} alt="Absolute Cinema" className="header-logo-img" />
                <h1>Absolute Cinema</h1>
            </Link>

            <div className="header-nav">
                {token && user ? (
                    <>
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
