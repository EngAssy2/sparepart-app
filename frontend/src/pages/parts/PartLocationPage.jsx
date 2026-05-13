import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import client from '../../api/client';
import { Search, Map, Package, ExternalLink, ChevronRight, X } from 'lucide-react';

const CabinetIcon = ({ size = 24, color = "currentColor", ...props }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke={color} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        {...props}
    >
        <path d="M2 4h20v2H2z" />
        <path d="M4 6v14h16V6" />
        <path d="M12 6v14" />
        <rect x="8" y="10" width="2" height="4" />
        <rect x="14" y="10" width="2" height="4" />
        <path d="M3 20h18v2H3z" />
    </svg>
);

const BoxIcon = ({ size = 24, color = "currentColor", ...props }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke={color} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        {...props}
    >
        <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3V6z" />
        <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
        <rect x="9" y="12" width="6" height="3" rx="1.5" />
    </svg>
);

export default function PartLocationPage() {
    const [parts, setParts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Helper to get initial search from URL or sessionStorage
    const getInitialSearch = () => {
        const fromUrl = searchParams.get('q');
        if (fromUrl !== null) return fromUrl;
        return sessionStorage.getItem('parts_location_search') || '';
    };

    const [search, setSearch] = useState(getInitialSearch);

    // Sync search to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('parts_location_search', search);
    }, [search]);

    const [selectedChild, setSelectedChild] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Derive selectedParentLocName from URL query param so browser back works
    const selectedParentLocName = searchParams.get('parent') || null;
    const childFromUrl = searchParams.get('child') || null;

    const openLocation = (group) => {
        const params = { parent: group.parentLocation };
        if (search) params.q = search;
        setSearchParams(params);
    };

    const openChild = (childGroup) => {
        const params = { parent: selectedParentLocName, child: childGroup.childName };
        if (search) params.q = search;
        setSearchParams(params);
        setSelectedChild(childGroup);
    };

    const closeLocation = () => {
        setSelectedChild(null);
        // Remove child param from URL but keep parent
        if (selectedParentLocName) {
            const params = { parent: selectedParentLocName };
            if (search) params.q = search;
            setSearchParams(params);
        }
    };

    const goBackToParents = () => {
        const params = {};
        if (search) params.q = search;
        setSearchParams(params);
    };

    useEffect(() => {
        const params = {};
        if (search) params.q = search;
        if (selectedParentLocName) params.parent = selectedParentLocName;
        if (childFromUrl) params.child = childFromUrl;
        
        setSearchParams(params, { replace: true });
    }, [search, selectedParentLocName, childFromUrl]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (selectedChild) {
                    closeLocation();
                } else if (selectedParentLocName) {
                    goBackToParents();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedChild, selectedParentLocName]);

    useEffect(() => {
        const fetchAllParts = async () => {
            setLoading(true);
            try {
                // Fetch a large limit to get all parts for mapping
                // Assuming we have at most a few thousand. For very large DBs, this might need pagination,
                // but for a visual layout page we typically want to group all available inventory.
                const res = await client.get('/parts', { params: { limit: 10000 } });
                
                const partsData = Array.isArray(res.data) ? res.data :
                    Array.isArray(res.data?.parts) ? res.data.parts :
                    Array.isArray(res.data?.data) ? res.data.data : [];
                    
                setParts(partsData);
            } catch (err) {
                console.error('Fetch parts error:', err);
                setParts([]);
            } finally {
                setLoading(false);
            }
        };

        fetchAllParts();
    }, []);

    // Filter parts by search, then group by Location
    const groupedLocations = useMemo(() => {
        const filtered = parts.filter(p => {
            if (!search) return true;
            const term = search.toLowerCase();
            return (
                (p.Part_Name || '').toLowerCase().includes(term) ||
                (p.Part_Number || '').toLowerCase().includes(term) ||
                (p.SEI_Part_Number || '').toLowerCase().includes(term) ||
                (p.Location || '').toLowerCase().includes(term)
            );
        });

        const groups = {};
        filtered.forEach(p => {
            const locName = p.Location?.trim() || 'Unassigned';
            let parent = 'Unassigned';
            let child = 'Unassigned';

            if (locName !== 'Unassigned') {
                const partsArr = locName.split('-');
                if (partsArr.length >= 3) {
                    parent = partsArr.slice(0, 2).join('-');
                    child = locName;
                } else {
                    parent = locName;
                    child = locName;
                }
            }

            if (!groups[parent]) groups[parent] = {};
            if (!groups[parent][child]) groups[parent][child] = [];
            groups[parent][child].push(p);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === 'Unassigned') return 1;
            if (b === 'Unassigned') return -1;
            return a.localeCompare(b);
        });

        return sortedKeys.map(parentKey => {
            const childKeys = Object.keys(groups[parentKey]).sort((a, b) => a.localeCompare(b));
            let totalParts = 0;
            const children = childKeys.map(childKey => {
                totalParts += groups[parentKey][childKey].length;
                return {
                    childName: childKey,
                    parts: groups[parentKey][childKey]
                };
            });
            return {
                parentLocation: parentKey,
                totalParts,
                children
            };
        });
    }, [parts, search]);

    const activeParent = selectedParentLocName ? groupedLocations.find(g => g.parentLocation === selectedParentLocName) : null;

    // Auto-restore child modal from URL query param (e.g., after browser back)
    useEffect(() => {
        if (childFromUrl && activeParent && !selectedChild) {
            const found = activeParent.children.find(c => c.childName === childFromUrl);
            if (found) {
                setSelectedChild(found);
            }
        }
    }, [childFromUrl, activeParent]);

    return (
        <AppShell title="Location Layout">
            <div className="page-header">
                <div>
                    <div className="page-title">Location Layout</div>
                    <div className="page-subtitle">
                        {activeParent ? `Viewing ${activeParent.parentLocation} sub-locations` : 'View your inventory grouped by physical location'}
                    </div>
                </div>
            </div>

            <div className="filter-bar" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {activeParent ? (
                    <button className="btn btn-secondary" onClick={goBackToParents} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        ← Back to All Locations
                    </button>
                ) : (
                    <div className="input-wrap" style={{ flex: 1, maxWidth: 400 }}>
                        <Search size={14} className="input-icon" />
                        <input
                            className="input"
                            placeholder="Search by part or location name…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
                    <span className="spinner" style={{ width: 30, height: 30, borderWidth: 3 }} />
                </div>
            ) : groupedLocations.length === 0 ? (
                <div className="empty-state">
                    <Map size={48} />
                    <h3>No locations found</h3>
                    <p>There are no parts maching your search criteria.</p>
                </div>
            ) : (
                <div style={{ 
                    columns: '350px',
                    columnGap: 24
                }}>
                    {!activeParent ? groupedLocations.map(group => (
                        <div key={group.parentLocation} className="card" style={{ padding: 0, overflow: 'hidden', breakInside: 'avoid', marginBottom: 24 }}>
                            <div 
                                onClick={() => openLocation(group)}
                                style={{ 
                                padding: '16px 20px', 
                                background: group.parentLocation === 'Unassigned' ? 'var(--bg-elevated)' : 'var(--accent-light)',
                                borderBottom: 'none',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <CabinetIcon size={32} color={group.parentLocation === 'Unassigned' ? 'var(--text-muted)' : 'var(--accent)'} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: group.parentLocation === 'Unassigned' ? 'var(--text-muted)' : 'var(--accent)' }}>
                                            {group.parentLocation}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                            {group.totalParts} Part{group.totalParts === 1 ? '' : 's'} • {group.children.length} Location{group.children.length === 1 ? '' : 's'}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <ChevronRight size={20} color="var(--text-muted)" />
                                </div>
                            </div>
                        </div>
                    )) : activeParent.children.map(childGroup => (
                        <div key={childGroup.childName} className="card" style={{ padding: 0, overflow: 'hidden', breakInside: 'avoid', marginBottom: 24 }}>
                            <div 
                                onClick={() => openChild(childGroup)}
                                style={{ 
                                padding: '16px 20px', 
                                background: 'var(--bg-elevated)',
                                borderBottom: 'none',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <BoxIcon size={32} color="var(--accent)" />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>
                                            {childGroup.childName}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                            {childGroup.parts.length} Part{childGroup.parts.length === 1 ? '' : 's'}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <Package size={20} color="var(--text-muted)" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selectedChild && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24
                }} onClick={closeLocation}>
                    <div 
                        className="card" 
                        style={{ 
                            width: '100%', 
                            maxWidth: 500, 
                            maxHeight: '80vh', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            padding: 0,
                            overflow: 'hidden'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'var(--bg-elevated)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Package size={24} color="var(--accent)" />
                                <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent)' }}>
                                    {selectedChild.childName}
                                </span>
                            </div>
                            <button 
                                onClick={closeLocation}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 4
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: 0 }}>
                            {selectedChild.parts.map(p => {
                                const isLow = p.Quantity <= (p.Safety_Stock || 0);
                                return (
                                    <div 
                                        key={p.SEI_Part_Number}
                                        style={{
                                            padding: '12px 20px',
                                            borderBottom: '1px solid var(--border)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            transition: 'background 0.15s',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = ''}
                                        onClick={() => navigate(`/parts/${p.SEI_Part_Number}`, { state: { fromLocation: true, parent: selectedParentLocName, child: selectedChild?.childName } })}
                                    >
                                        <div style={{ flex: 1, overflow: 'hidden', paddingRight: 10 }}>
                                            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 1 }}>
                                                {p.Part_Number}
                                            </div>
                                            <div style={{ fontWeight: 600, fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                {p.Part_Name}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                {p.SEI_Part_Number}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700, color: isLow ? 'var(--danger)' : 'var(--success)' }}>
                                                {p.Quantity}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                Qty
                                            </div>
                                        </div>
                                        <div style={{ marginLeft: 16, color: 'var(--text-muted)' }}>
                                            <ExternalLink size={14} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
