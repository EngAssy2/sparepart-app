import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell({ title, children }) {
    const [isMinimized, setIsMinimized] = useState(() => {
        return localStorage.getItem('sidebar_minimized') === 'true';
    });

    useEffect(() => {
        localStorage.setItem('sidebar_minimized', isMinimized);
    }, [isMinimized]);

    return (
        <div className={`app-shell ${isMinimized ? 'sidebar-minimized' : ''}`}>
            <Sidebar isMinimized={isMinimized} />
            <div className="app-main">
                <Topbar title={title} isMinimized={isMinimized} onToggle={() => setIsMinimized(!isMinimized)} />
                <main className="page-content">
                    {children}
                </main>
            </div>
        </div>
    );
}
