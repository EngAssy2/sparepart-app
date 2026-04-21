import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    LayoutDashboard, Package, PackagePlus, PackageMinus,
    ClipboardList, Users, BarChart3, LogOut, Boxes,
    ShoppingCart, FileText, FileCheck, Truck
} from 'lucide-react';

import siixLogo from '../../assets/Siix-logo.ico';

const LEVEL_NAMES = { 1: 'Super User', 2: 'Admin', 3: 'Supervisor', 4: 'Technician' };

const navItems = [
    {
        label: 'MAIN', items: [
            { to: '/dashboard', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
        ]
    },
    {
        label: 'INVENTORY', items: [
            { to: '/parts', icon: <Package size={16} />, label: 'Parts List' },
            { to: '/locations', icon: <Boxes size={16} />, label: 'Location Layout' },
            { to: '/stock-in', icon: <PackagePlus size={16} />, label: 'Stock In', minLevel: 4 },
            { to: '/stock-out', icon: <PackageMinus size={16} />, label: 'Stock Out', minLevel: 4 },
        ]
    },
    {
        label: 'PROCUREMENT', items: [
            { to: '/procurement/pr', icon: <FileText size={16} />, label: 'Purchase Requests', maxLevel: 3 },
            { to: '/procurement/po', icon: <FileCheck size={16} />, label: 'Purchase Orders', maxLevel: 2 },
            { to: '/procurement/do', icon: <Truck size={16} />, label: 'Delivery Orders', maxLevel: 3 },
        ]
    },
    {
        label: 'RECORDS', items: [
            { to: '/transactions', icon: <ClipboardList size={16} />, label: 'Transaction History' },
            { to: '/reports', icon: <BarChart3 size={16} />, label: 'Reports', maxLevel: 3 },
        ]
    },
    {
        label: 'ADMIN', items: [
            { to: '/users', icon: <Users size={16} />, label: 'User Management' },
        ]
    },
];

export default function Sidebar({ isMinimized }) {
    const { user, level, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const canSee = (item) => {
        if (item.maxLevel !== undefined && level > item.maxLevel) return false;
        if (item.minLevel !== undefined && level > item.minLevel) return false;
        return true;
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-inner">
                    <div className="sidebar-logo-icon" style={{ background: 'transparent', boxShadow: 'none' }}>
                        <img src={siixLogo} alt="SEI Logo" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                    </div>
                    <div>
                        <div className="sidebar-logo-text">SEI Sparepart</div>
                        <div className="sidebar-logo-sub">Inventory System</div>
                    </div>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((section) => {
                    const visible = section.items.filter(canSee);
                    if (!visible.length) return null;
                    return (
                        <div key={section.label}>
                            <div className="sidebar-section-label">{section.label}</div>
                            {visible.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
                                    title={isMinimized ? item.label : undefined}
                                >
                                    {item.icon}
                                    <span className="sidebar-item-label">{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="sidebar-avatar">
                        {(user?.User_Name || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div className="sidebar-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user?.User_Name || 'Unknown'}
                        </div>
                        <div className="sidebar-user-level">{LEVEL_NAMES[level] || 'User'}</div>
                    </div>
                </div>
                <button className="sidebar-logout" onClick={handleLogout} title="Logout">
                    <LogOut size={15} />
                    <span className="sidebar-logout-text">Logout</span>
                </button>
            </div>
        </aside>
    );
}
