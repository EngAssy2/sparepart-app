import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

const AuthContext = createContext(null);

/**
 * Decode a JWT payload without a library (base64url → JSON).
 * Returns null if the token is malformed.
 */
function decodeJwtPayload(token) {
    try {
        const base64 = token.split('.')[1];
        const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(json);
    } catch {
        return null;
    }
}

/**
 * Check whether a JWT token is expired by reading its `exp` claim.
 * Returns true if expired or invalid, false if still valid.
 */
function isTokenExpired(token) {
    if (!token) return true;
    const payload = decodeJwtPayload(token);
    if (!payload || !payload.exp) return true;
    // exp is in seconds, Date.now() is in milliseconds
    return Date.now() >= payload.exp * 1000;
}

function parseUser() {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
}

function SessionExpiredModal({ onConfirm }) {
    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '400px', textAlign: 'center', padding: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warning)' }}>
                        <AlertTriangle size={24} />
                    </div>
                </div>
                <h3 className="modal-title" style={{ marginBottom: '8px' }}>Session Expired</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                    Your session has ended or your token has expired. Please log in again to continue.
                </p>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={onConfirm}>
                    Back to Login
                </button>
            </div>
        </div>
    );
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        // On initial load, validate the stored token
        const storedToken = localStorage.getItem('token');
        if (isTokenExpired(storedToken)) {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            return null;
        }
        return parseUser();
    });
    const [token, setToken] = useState(() => {
        const storedToken = localStorage.getItem('token');
        if (isTokenExpired(storedToken)) {
            return null;
        }
        return storedToken;
    });
    const [showExpiryModal, setShowExpiryModal] = useState(false);

    useEffect(() => {
        const handleExpiry = () => setShowExpiryModal(true);
        window.addEventListener('session-expired', handleExpiry);
        return () => window.removeEventListener('session-expired', handleExpiry);
    }, []);

    // Periodically check if the token has expired (every 60 seconds)
    useEffect(() => {
        if (!token) return;
        const interval = setInterval(() => {
            if (isTokenExpired(token)) {
                setShowExpiryModal(true);
            }
        }, 60000);
        return () => clearInterval(interval);
    }, [token]);

    const login = useCallback((userData, jwt) => {
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', jwt);
        setUser(userData);
        setToken(jwt);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setUser(null);
        setToken(null);
    }, []);

    const handleConfirmExpiry = () => {
        logout();
        setShowExpiryModal(false);
        window.location.href = '/login';
    };

    // Authority levels: 0=Super User, 1=DCC, 2=Admin, 3=Supervisor, 4=Technician
    const level = user?.Authority_Level ?? 99;
    const isSuperUser = level === 0;
    const isDCC = level <= 1;
    const isAdmin = level <= 2;
    const isSupervisor = level <= 3;
    const isTechnician = level <= 4;

    return (
        <AuthContext.Provider value={{
            user, token,
            login, logout,
            level, isSuperUser, isAdmin, isSupervisor, isTechnician,
            isAuthenticated: !!token && !isTokenExpired(token),
        }}>
            {children}
            {showExpiryModal && <SessionExpiredModal onConfirm={handleConfirmExpiry} />}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
