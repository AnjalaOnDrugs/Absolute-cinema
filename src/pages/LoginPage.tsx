import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import logo from '../assets/logo.png';

// Map Convex error messages to user-friendly messages
function mapErrorMessage(error: string): string {
    if (error.includes('Invalid email or password')) {
        return 'Incorrect email or password. Please try again.';
    }
    if (error.includes('Invalid session')) {
        return 'Your session has expired. Please log in again.';
    }
    return 'Login failed. Please try again.';
}

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const loginMutation = useMutation(api.users.login);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const result = await loginMutation({ email, password });
            login(result.token, result.user);

            navigate('/');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Login failed';
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
                    <p className="auth-subtitle">Sign in to watch together</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="toast error" style={{ position: 'static' }}>
                            {error}
                        </div>
                    )}

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
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isLoading}
                        style={{ width: '100%', marginTop: '8px' }}
                    >
                        {isLoading ? <span className="spinner" /> : 'Sign In'}
                    </button>
                </form>

                <div className="auth-footer">
                    Don't have an account?{' '}
                    <Link to="/register">Create one</Link>
                </div>
            </div>
        </div>
    );
}
