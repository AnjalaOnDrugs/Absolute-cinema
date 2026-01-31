import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
    onLogout: () => void;
}

export function Header({ onLogout }: HeaderProps) {
    const { user, token } = useAuth();

    return (
        <header className="header">
            <Link to="/" className="header-logo">
                <span style={{ fontSize: '1.5rem' }}>🎬</span>
                <h1>Absolute Cinema</h1>
            </Link>

            <div className="header-nav">
                {token && user ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="avatar">
                                {user.displayName?.charAt(0).toUpperCase() || 'U'}
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
