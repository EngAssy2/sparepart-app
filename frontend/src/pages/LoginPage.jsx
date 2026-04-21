import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { Hash, Eye, EyeOff, Lock, PackageMinus, PackageSearch } from 'lucide-react';
import siixLogo from '../assets/Siix-logo.ico';

export default function LoginPage() {
    const [badge, setBadge] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!badge.trim()) { setError('Please enter your badge number.'); return; }
        setLoading(true);
        setError('');
        try {
            const res = await client.post('/auth/login', { badge: badge.trim(), password: password || undefined });
            login(res.data.user, res.data.token);
            navigate('/dashboard', { replace: true });
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Login failed. Check your badge number.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <div className="login-logo-icon" style={{ background: 'transparent', boxShadow: 'none' }}>
                        <img src={siixLogo} alt="SEI Logo" style={{ width: 50, height: 50, objectFit: 'contain' }} />
                    </div>
                    <div>
                        <div className="login-title">Sparepart</div>
                        <div className="login-sub">Inventory System</div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="form-group">
                        <label className="form-label required">Badge Number</label>
                        <div className="input-wrap">
                            <Hash size={15} className="input-icon" />
                            <input
                                className="input"
                                type="text"
                                placeholder="Enter your badge number"
                                value={badge}
                                onChange={(e) => setBadge(e.target.value.toUpperCase())}
                                autoFocus
                                autoComplete="username"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label required">Password</label>
                        <div className="input-wrap" style={{ position: 'relative' }}>
                            <Lock size={15} className="input-icon" />
                            <input
                                className="input"
                                type={showPass ? 'text' : 'password'}
                                placeholder="Enter password (if required)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                style={{ paddingRight: 40 }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPass(!showPass)}
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="alert alert-danger" style={{ fontSize: 13 }}>
                            {error}
                        </div>
                    )}

                    <button className="btn btn-primary btn-lg w-full" type="submit" disabled={loading}>
                        {loading ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Signing in…</> : 'Sign In'}
                    </button>
                </form>

                <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 20, display: 'flex', gap: 12 }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate('/public/stock-out')}
                        style={{ flex: 1, gap: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <PackageMinus size={16} /> Public Stock Out
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate('/public/part-info')}
                        style={{ flex: 1, gap: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <PackageSearch size={16} /> Part Info
                    </button>
                </div>

                <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                    Contact your administrator to reset access
                </div>
                <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', opacity: 0.5 }}>
                    v{__APP_VERSION__}
                </div>
            </div>
        </div>
    );
}
