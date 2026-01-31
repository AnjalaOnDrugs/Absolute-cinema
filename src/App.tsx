import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { RoomPage } from './pages/RoomPage';
import './index.css';

// Initialize Convex client
// Replace with your actual Convex deployment URL
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || 'https://your-deployment.convex.cloud');

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Type alias for Convex IDs
type Id<T extends string> = string & { __tableName: T };

function App() {
  const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || 'https://your-deployment.convex.cloud');

  // Add cleanup listener
  useEffect(() => {
    const handleUnload = () => {
      // Attempt to cleanup using beacon if possible, or synchronous fetch if allowed.
      // Since Convex client is WebSocket, standard synchronous events might not work perfect.
      // We can try to grab the user from localStorage and call the mutation via a temporary client or fetch.
      const savedUserStr = localStorage.getItem('authUser');
      if (savedUserStr) {
        try {
          const user = JSON.parse(savedUserStr);
          // We construct a simple fetch to the http endpoint if possible, or try to use the client.
          // However, directly using the client inside unload is unstable.
          // For Tauri app, this runs when closing?
          // Let's rely on standard mutation call and hope wait works, or use navigator.sendBeacon if we had an HTTP endpoint.

          // Note: Convex functions are exposed over HTTP at /api/mutation
          // We can use navigator.sendBeacon
          const convexUrl = import.meta.env.VITE_CONVEX_URL;
          if (convexUrl && user._id) {
            const url = `${convexUrl}/api/mutation`;
            const body = JSON.stringify({
              path: "users:cleanupUser",
              args: { userId: user._id },
              format: "json"
            });
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
          }
        } catch (e) {
          console.error("Cleanup failed", e);
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return (
    <ConvexProvider client={convexClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/room/:roomId"
              element={
                <ProtectedRoute>
                  <RoomPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConvexProvider>
  );
}

export default App;
