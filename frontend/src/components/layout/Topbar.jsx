import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bell, ChevronLeft, Menu, Globe, Clock } from 'lucide-react';

export default function Topbar({ title, isMinimized, onToggle }) {
    const { token } = useAuth();
    const navigate = useNavigate();
    
    // Time & Location
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const dayStr = currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const [browserType, setBrowserType] = useState('Detecting...');

    useEffect(() => {
        const ua = navigator.userAgent;
        let browser = 'Unknown Browser';
        if (ua.includes('Edg/')) browser = 'Edge';
        else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
        else if (ua.includes('Chrome/')) browser = 'Chrome';
        else if (ua.includes('Firefox/')) browser = 'Firefox';
        else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
        
        setBrowserType(browser);
    }, []);

    // Notifications
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const dropdownRef = useRef(null);

    const fetchNotifications = async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/notifications', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const json = await res.json();
                setNotifications(json.data || []);
            }
        } catch (err) {}
    };

    useEffect(() => {
        fetchNotifications();
        // Poll every 60s
        const pollInterval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(pollInterval);
    }, [token]);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Render Notifications
    const renderNotifications = () => {
        if (notifications.length === 0) {
            return (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No notifications
                </div>
            );
        }

        const grouped = {
            low_stock: notifications.filter(n => n.type === 'low_stock'),
            pr_approval: notifications.filter(n => n.type === 'pr_approval'),
            pr_update: notifications.filter(n => n.type === 'pr_update')
        };

        const NotificationItem = ({ onClick, color, title, message, time }) => (
            <div 
                onClick={onClick}
                style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: color }}>{title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{message}</div>
                {time && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{time}</div>}
            </div>
        );

        const elements = [];

        // 1. Low Stock Group
        if (grouped.low_stock.length > 0) {
            elements.push(
                <NotificationItem 
                    key="group-low-stock"
                    onClick={() => { navigate('/parts?stock=low'); setShowNotifications(false); }}
                    color="var(--danger)"
                    title="Low Stock Alerts"
                    message={grouped.low_stock.length === 1 ? '1 part is currently low on stock.' : `${grouped.low_stock.length} parts are currently low on stock.`}
                />
            );
        }

        // 2. Pending Approvals Group
        if (grouped.pr_approval.length > 0) {
            elements.push(
                <NotificationItem 
                    key="group-pr-approval"
                    onClick={() => { navigate('/procurement/pr'); setShowNotifications(false); }}
                    color="var(--warning)"
                    title="Pending Approvals"
                    message={grouped.pr_approval.length === 1 ? '1 PR requires your approval.' : `${grouped.pr_approval.length} PRs require your approval.`}
                />
            );
        }

        // 3. Independent PR Updates (limit to 5)
        if (grouped.pr_update.length > 0) {
            if (elements.length > 0) {
                elements.push(
                    <div key="pr-update-header" style={{ padding: '8px 16px', backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Recent PR Updates
                    </div>
                );
            }
            grouped.pr_update.slice(0, 5).forEach(notif => {
                elements.push(
                    <NotificationItem 
                        key={notif.id}
                        onClick={() => { navigate(notif.link); setShowNotifications(false); }}
                        color="var(--info)"
                        title={notif.title}
                        message={notif.message}
                        time={new Date(notif.timestamp).toLocaleString()}
                    />
                );
            });
            if (grouped.pr_update.length > 5) {
                elements.push(
                    <div key="pr-update-more" style={{ padding: '10px 16px', fontSize: 12, textAlign: 'center', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                        + {grouped.pr_update.length - 5} more update(s)
                    </div>
                );
            }
        }

        return <div style={{ display: 'flex', flexDirection: 'column' }}>{elements}</div>;
    };

    return (
        <header className="topbar">
            {onToggle && (
                <button className="btn btn-ghost btn-icon" onClick={onToggle} title="Toggle Menu">
                    <Menu size={18} />
                </button>
            )}
            <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)} title="Go back">
                <ChevronLeft size={18} />
            </button>
            <span className="topbar-title">{title || 'SpareTrack'}</span>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="topbar-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                    <Globe size={14} style={{ color: 'var(--text-muted)' }} />
                    <span>{browserType}</span>
                </div>

                <div className="topbar-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0, fontSize: 11, opacity: 0.7 }}>
                    v{__APP_VERSION__}
                </div>

                <div className="topbar-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                    <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dayStr} {timeStr}</span>
                </div>
            </div>

            <div style={{ position: 'relative' }} ref={dropdownRef}>
                <button 
                    className="btn btn-ghost btn-icon" 
                    title="Notifications"
                    onClick={() => { setShowNotifications(!showNotifications); if(!showNotifications) fetchNotifications(); }}
                    style={{ position: 'relative' }}
                >
                    <Bell size={17} />
                    {notifications.length > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: 'var(--danger)',
                            border: '2px solid var(--bg-card)'
                        }} />
                    )}
                </button>
                
                {showNotifications && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 8,
                        width: 320,
                        maxHeight: 400,
                        overflowY: 'auto',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, position: 'sticky', top: 0, backgroundColor: 'var(--bg-elevated)', zIndex: 2 }}>
                            Notifications ({notifications.length})
                        </div>
                        {renderNotifications()}
                    </div>
                )}
            </div>
        </header>
    );
}
