import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { listen } from '@tauri-apps/api/event';
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

  // FFmpeg setup state
  const [showFFmpegSetup, setShowFFmpegSetup] = useState(true);
  const [ffmpegReady, setFfmpegReady] = useState(false);

  // Cleanup on window close
  useEffect(() => {
    const cleanupAndClearStorage = async () => {
      const savedUserStr = localStorage.getItem('authUser');
      if (savedUserStr) {
        try {
          const user = JSON.parse(savedUserStr);
          const convexUrl = import.meta.env.VITE_CONVEX_URL;
          if (convexUrl && user._id) {
            await fetch(`${convexUrl}/api/mutation`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                path: "users:cleanupUser",
                args: { userId: user._id },
                format: "json"
              }),
            });
          }
        } catch (e) {
          console.error("Cleanup failed", e);
        }
      }
      localStorage.removeItem('authUser');
      localStorage.removeItem('authToken');
    };

    // Tauri: use reliable close event from Rust
    const isTauri = !!(window as any).__TAURI_INTERNALS__;
    if (isTauri) {
      const unlisten = listen('window-close-requested', () => {
        cleanupAndClearStorage();
      });
      return () => { unlisten.then((fn) => fn()); };
    }

    // Browser fallback: sendBeacon (best-effort)
    const handleUnload = () => {
      const savedUserStr = localStorage.getItem('authUser');
      if (savedUserStr) {
        try {
          const user = JSON.parse(savedUserStr);
          const convexUrl = import.meta.env.VITE_CONVEX_URL;
          if (convexUrl && user._id) {
            const body = JSON.stringify({
              path: "users:cleanupUser",
              args: { userId: user._id },
              format: "json"
            });
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(`${convexUrl}/api/mutation`, blob);
          }
        } catch (e) {
          console.error("Cleanup failed", e);
        }
      }
      localStorage.removeItem('authUser');
      localStorage.removeItem('authToken');
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const handleFFmpegSetupComplete = (ffmpegAvailable: boolean) => {
    setFfmpegReady(true);
    setShowFFmpegSetup(false);

    // Store the FFmpeg availability status for later use
    localStorage.setItem('ffmpeg_available', ffmpegAvailable ? 'true' : 'false');
  };

  return (
    <ConvexProvider client={convexClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            } />
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

