import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Eye, Pencil, Trash2, Package, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import config from '../../config.json';

function StatusBadge({ status }) {
    const map = { 'STOCK ENOUGH': 'badge-success', 'ORDER PART': 'badge-warning', 'URGENT PART': 'badge-danger' };
    return <span className={`badge ${map[status?.toUpperCase()] || map[status] || 'badge-muted'}`}>{status || '—'}</span>;
}
function PriorityBadge({ priority }) {
    const map = { '1ST PRIORITY': 'badge-danger', '2ND PRIORITY': 'badge-warning', 'NO REQUEST': 'badge-muted' };
    return <span className={`badge ${map[priority?.toUpperCase()] || 'badge-muted'}`}>{priority || '—'}</span>;
}
function CategoryBadge({ category }) {
    const map = { 'CRITICAL PART': 'badge-danger', 'NO CRITICAL PART': 'badge-muted' };
    return <span className={`badge ${map[category?.toUpperCase()] || 'badge-muted'}`}>{category || '—'}</span>;
}

export default function PartsListPage() {
    const [parts, setParts] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [status, setStatus] = useState('');
    const [priority, setPriority] = useState('');
    const [page, setPage] = useState(1);
    const [confirmModal, setConfirmModal] = useState(null);
    const [exporting, setExporting] = useState(false);
    const limit = 20;

    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const initialStock = queryParams.get('stock') === 'low' ? 'low' : '';

    const [stockFilter, setStockFilter] = useState(initialStock);
    
    const { isAdmin } = useAuth();
    const navigate = useNavigate();

    const fetchParts = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, limit, search, category, status, priority, stock: stockFilter };
            const res = await client.get('/parts', { params });

            // Ensure we always get an array
            const partsData = Array.isArray(res.data) ? res.data :
                Array.isArray(res.data?.parts) ? res.data.parts :
                    Array.isArray(res.data?.data) ? res.data.data : [];

            setParts(partsData);
            setTotal(res.data?.total || partsData.length);
            console.log('API Response:', res.data);
            console.log('Type:', typeof res.data);
            console.log('Is Array:', Array.isArray(res.data));
        } catch (err) {
            console.error('Fetch parts error:', err);
            setParts([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [page, search, category, status, priority, stockFilter]);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const urlStock = queryParams.get('stock') === 'low' ? 'low' : '';
        if (urlStock !== stockFilter) {
            setStockFilter(urlStock);
            setPage(1);
        }
    }, [location.search]);

    useEffect(() => { fetchParts(); }, [fetchParts]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setConfirmModal(null);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const handleDelete = (seiNum) => {
        setConfirmModal(seiNum);
    };

    const executeDelete = async () => {
        if (!confirmModal) return;
        try {
            await client.delete(`/parts/${confirmModal}`);
            fetchParts();
            setConfirmModal(null);
        } catch (err) {
            setConfirmModal(null);
            alert(err.response?.data?.message || 'Delete failed');
        }
    };

    const handleExport = async () => {
        try {
            setExporting(true);
            const params = { page: 1, limit: 10000, search, category, status, priority, stock: stockFilter };
            const res = await client.get('/parts', { params });
            
            const rawData = Array.isArray(res.data) ? res.data :
                Array.isArray(res.data?.parts) ? res.data.parts :
                    Array.isArray(res.data?.data) ? res.data.data : [];

            const formatted = rawData.map(p => ({
                'SEI Part Number': p.SEI_Part_Number,
                'Supplier Part Number': p.Part_Number,
                'Part Name': p.Part_Name,
                'Category': p.Part_Category,
                'Quantity': p.Quantity,
                'Safety Stock': p.Safety_Stock,
                'Status': p.Part_Status,
                'Priority': p.Priority_Level,
                'Section': p.Section,
                'Location': p.Location,
                'Model': p.Model,
                'Brand': p.Brand,
                'Supplier': p.Supplier
            }));

            const ws = XLSX.utils.json_to_sheet(formatted);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Inventory");
            
            XLSX.writeFile(wb, `Parts_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);

        } catch (err) {
            console.error('Export failed', err);
            alert('Failed to export data.');
        } finally {
            setExporting(false);
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <AppShell title="Parts List">
            <div className="page-header">
                <div>
                    <div className="page-title">Parts List</div>
                    <div className="page-subtitle">{total.toLocaleString()} parts registered</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
                        {exporting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Download size={15} />}
                        Export
                    </button>
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={() => navigate('/parts/new')}>
                            <Plus size={15} /> Register Part
                        </button>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="filter-bar">
                <div className="input-wrap" style={{ flex: 1, minWidth: 200 }}>
                    <Search size={14} className="input-icon" />
                    <input
                        className="input"
                        placeholder="Search part number, name…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <select className="select-ctrl" value={stockFilter} onChange={(e) => { setStockFilter(e.target.value); setPage(1); }}>
                    <option value="">All Stock</option>
                    <option value="low">Low Stock</option>
                </select>
                <select className="select-ctrl" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
                    {['', ...config.Category].map(c => <option key={c} value={c}>{c || 'All Categories'}</option>)}
                </select>
                <select className="select-ctrl" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                    {['', ...config.StatusList].map(s => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
                </select>
                <select className="select-ctrl" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
                    {['', ...config.PriorityList].map(p => <option key={p} value={p}>{p || 'All Priorities'}</option>)}
                </select>
            </div>

            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>SEI Part #</th>
                            <th>Part Number</th>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Qty</th>
                            <th>Safety</th>
                            <th>Status</th>
                            <th>Priority</th>
                            <th>Section</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></td></tr>
                        ) : Array.isArray(parts) && parts.length === 0 ? (
                            <tr><td colSpan={10}>
                                <div className="empty-state" style={{ padding: 40 }}>
                                    <Package size={40} />
                                    <p>No parts found</p>
                                </div>
                            </td></tr>
                        ) : Array.isArray(parts) ? (
                            parts.map((p) => {
                                const lowStock = (p.Quantity ?? 0) <= (p.Safety_Stock ?? 0);
                                return (
                                    <tr key={p.SEI_Part_Number}>
                                        <td className="td-mono">{p.SEI_Part_Number}</td>
                                        <td className="td-mono">{p.Part_Number}</td>
                                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.Part_Name}</td>
                                        <td><CategoryBadge category={p.Part_Category} /></td>
                                        <td>
                                            <span style={{ fontWeight: 600, color: lowStock ? 'var(--danger)' : 'var(--success)' }}>
                                                {p.Quantity}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)' }}>{p.Safety_Stock}</td>
                                        <td><StatusBadge status={p.Part_Status} /></td>
                                        <td><PriorityBadge priority={p.Priority_Level} /></td>
                                        <td style={{ color: 'var(--text-muted)' }}>{p.Section || '—'}</td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button className="btn btn-ghost btn-icon btn-sm" title="View" onClick={() => navigate(`/parts/${p.SEI_Part_Number}`)}>
                                                    <Eye size={14} />
                                                </button>
                                                {isAdmin && (
                                                    <>
                                                        <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => navigate(`/parts/${p.SEI_Part_Number}/edit`)}>
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button className="btn btn-danger btn-icon btn-sm" title="Delete" onClick={() => handleDelete(p.SEI_Part_Number)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={10}>
                                    Error: Invalid data format
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="pagination">
                    <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        const p = i + 1;
                        return (
                            <button key={p} className={`page-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                        );
                    })}
                    <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                </div>
            )}

            {/* Confirm Delete Modal */}
            {confirmModal && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(null); }}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                Confirm Deletion
                            </div>
                            <button className="btn btn-ghost" onClick={() => setConfirmModal(null)}>✕</button>
                        </div>
                        <div style={{ padding: '20px 0', lineHeight: 1.5, fontSize: 16 }}>
                            Are you sure you want to delete part <strong>{confirmModal}</strong>? This cannot be undone.
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={executeDelete}>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
