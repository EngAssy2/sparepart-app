import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import AppShell from '../../components/layout/AppShell';
import { FileCheck, Plus, XCircle, Eye, Search, AlertTriangle } from 'lucide-react';

export default function POPage() {
    const { token, level } = useAuth();
    const [pos, setPos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [detailPO, setDetailPO] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Form state
    const [supplier, setSupplier] = useState('');
    const [expectedDate, setExpectedDate] = useState('');
    const [remarks, setRemarks] = useState('');
    const [prNumber, setPrNumber] = useState('');
    const [poNumber, setPoNumber] = useState('');
    const [prData, setPrData] = useState(null);
    const [items, setItems] = useState([]);
    const [fetchPrError, setFetchPrError] = useState('');
    const [confirmModal, setConfirmModal] = useState(null);
    const [errorModalMsg, setErrorModalMsg] = useState('');
    const [showCreateConfirm, setShowCreateConfirm] = useState(false);

    const fetchPOs = async () => {
        try {
            const res = await fetch('/api/procurement/po', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) setPos((await res.json()).data);
        } catch (err) { }
        setLoading(false);
    };

    useEffect(() => { fetchPOs(); }, [token]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setShowModal(false);
                setDetailPO(null);
                setConfirmModal(null);
                setShowCreateConfirm(false);
                setErrorModalMsg('');
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const handleFetchPR = async () => {
        setFetchPrError('');
        try {
            const res = await fetch(`/api/procurement/pr/${prNumber}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                if (data.Status !== 'Approved') {
                    setFetchPrError('Error: This PR is not in "Approved" status.');
                    return;
                }
                setPrData(data);
                setItems(data.items.map(it => ({
                    PR_Item_ID: it.id,
                    Part_Number: it.Part_Number,
                    Part_Name: it.Part_Name,
                    Quantity: it.Quantity,
                    Unit_Price: 0
                })));
            } else {
                setFetchPrError('PR not found');
            }
        } catch (err) { }
    };

    const handleCreatePO = (e) => {
        e.preventDefault();
        const validItems = items.filter(i => i.Part_Number && i.Quantity > 0);
        if (!validItems.length) {
            setErrorModalMsg('Add at least one item');
            return;
        }
        setShowCreateConfirm(true);
    };

    const executeCreatePO = async () => {
        setShowCreateConfirm(false);
        const validItems = items.filter(i => i.Part_Number && i.Quantity > 0);
        // Trim string fields before submitting
        const cleanPoNumber = poNumber.trim();
        const cleanSupplier = supplier.trim();
        const cleanRemarks = remarks.trim();

        try {
            const res = await fetch('/api/procurement/po', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    PO_Number: cleanPoNumber,
                    PR_Number: prNumber.trim(),
                    Supplier: cleanSupplier,
                    Expected_Delivery: expectedDate,
                    Remarks: cleanRemarks,
                    items: validItems
                })
            });
            if (res.ok) {
                setShowModal(false);
                setPoNumber('');
                setSupplier('');
                setExpectedDate('');
                setRemarks('');
                setPrNumber('');
                setPrData(null);
                setItems([]);
                fetchPOs();
            } else {
                const errorData = await res.json();
                setErrorModalMsg(errorData.error || 'Error creating PO');
            }
        } catch (err) {
            setErrorModalMsg('Network or server error occurred.');
        }
    };

    const executeStatusChange = async (id, stat) => {
        try {
            const res = await fetch(`/api/procurement/po/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ Status: stat })
            });
            if (res.ok) {
                setConfirmModal(null);
                fetchPOs();
            } else {
                const errorData = await res.json();
                setConfirmModal(null);
                setErrorModalMsg(errorData.error || 'Failed to update PO status');
            }
        } catch (err) {
            setConfirmModal(null);
            setErrorModalMsg('Network or server error occurred.');
        }
    };

    const openDetail = async (id) => {
        try {
            const res = await fetch(`/api/procurement/po/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) setDetailPO(await res.json());
        } catch (err) { }
    };

    return (
        <AppShell title="Purchase Orders">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Purchase Orders</h1>
                    <div className="page-subtitle">Track and manage external orders placed with suppliers</div>
                </div>
                {level <= 2 && (
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <Plus size={16} /> New PO
                    </button>
                )}
            </div>

            <div className="filter-bar" style={{ marginBottom: 20 }}>
                <div className="input-wrap" style={{ flex: 1, maxWidth: 350 }}>
                    <Search size={14} className="input-icon" />
                    <input
                        className="input"
                        placeholder="Search PO Number, Supplier, or Status..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="card table-wrap">
                {loading ? <div style={{ padding: 20 }}>Loading...</div> : (
                    <table>
                        <thead>
                            <tr>
                                <th>PO Number</th>
                                <th>Date</th>
                                <th>Supplier</th>
                                <th>Expected</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pos.filter(po => {
                                if (!searchTerm) return true;
                                const term = searchTerm.toLowerCase();
                                return po.PO_Number.toLowerCase().includes(term) ||
                                    po.Supplier?.toLowerCase().includes(term) ||
                                    po.Status.toLowerCase().includes(term);
                            }).map(po => (
                                <tr key={po.PO_Number}>
                                    <td className="td-mono">{po.PO_Number}</td>
                                    <td>{new Date(po.Order_Date).toLocaleDateString()}</td>
                                    <td>{po.Supplier}</td>
                                    <td>{po.Expected_Delivery ? new Date(po.Expected_Delivery).toLocaleDateString() : '-'}</td>
                                    <td>
                                        <span className={`badge ${po.Status === 'Closed' ? 'badge-success' : po.Status === 'Cancelled' ? 'badge-danger' : 'badge-info'}`}>
                                            {po.Status}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 5 }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" title="View Details" onClick={() => openDetail(po.PO_Number)}>
                                                <Eye size={14} />
                                            </button>
                                            {level <= 2 && po.Status === 'Pending' && (
                                                <button className="btn btn-primary btn-sm btn-icon" title="Mark Sent" onClick={() => setConfirmModal({ id: po.PO_Number, stat: 'Sent' })}>
                                                    Send
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {pos.length === 0 && <tr><td colSpan="6" className="empty-state">No Purchase Orders found.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create PO Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <div className="modal-title">New Purchase Order</div>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}><XCircle size={20} /></button>
                        </div>

                        {!prData ? (
                            <div className="form-group" style={{ marginBottom: 20 }}>
                                <label className="form-label">Enter Approved PR Number</label>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <input className="input" placeholder="e.g. PR-00001" value={prNumber} onChange={e => setPrNumber(e.target.value)} />
                                    <button className="btn btn-primary" onClick={handleFetchPR}>Lookup PR</button>
                                </div>
                                {fetchPrError && <div style={{ color: 'var(--danger)', marginTop: 5 }}>{fetchPrError}</div>}
                            </div>
                        ) : (
                            <form onSubmit={handleCreatePO} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') e.preventDefault(); }}>
                                <div style={{ marginBottom: 20, padding: 15, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                                    <strong>Creating PO from PR:</strong> {prData.PR_Number} <br />
                                    <strong>Requester:</strong> {prData.Requester_Name}
                                </div>

                                <div className="form-group" style={{ marginBottom: 15 }}>
                                    <label className="form-label required">PO Number</label>
                                    <input className="input" placeholder="e.g. PO-2023-01" value={poNumber} onChange={e => setPoNumber(e.target.value)} required />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 15 }}>
                                    <div className="form-group">
                                        <label className="form-label">Supplier</label>
                                        <input className="input" value={supplier} onChange={e => setSupplier(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Expected Delivery Date</label>
                                        <input type="date" className="input" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginBottom: 16 }}>
                                    <label className="form-label">Remarks</label>
                                    <textarea className="textarea-ctrl" value={remarks} onChange={e => setRemarks(e.target.value)} />
                                </div>

                                <div style={{ fontWeight: 600, marginBottom: 10 }}>Order Items (from PR)</div>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    <div style={{ flex: 1 }}>Part</div>
                                    <div style={{ width: 60, textAlign: 'center' }}>Qty</div>
                                    <div style={{ width: 120 }}>Unit Price (Rp.)</div>
                                </div>
                                {items.map((it, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                                        <div style={{ flex: 1 }}>{it.Part_Number} - {it.Part_Name}</div>
                                        <div style={{ width: 60, textAlign: 'center', fontWeight: 500 }}>{it.Quantity}</div>
                                        <input type="number" className="input" style={{ width: 120 }} placeholder="0" value={it.Unit_Price} min="0" step="1" onChange={e => { const n = [...items]; n[idx].Unit_Price = e.target.value; setItems(n); }} required />
                                    </div>
                                ))}

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setPrData(null)}>Back to PR Search</button>
                                    <button type="submit" className="btn btn-primary">Create PO</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* PO Detail Modal */}
            {detailPO && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetailPO(null); }}>
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <div className="modal-title">PO Details: {detailPO.PO_Number}</div>
                            <button className="btn btn-ghost" onClick={() => setDetailPO(null)}><XCircle size={20} /></button>
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <div><strong>Supplier:</strong> {detailPO.Supplier}</div>
                            <div><strong>Date:</strong> {new Date(detailPO.Order_Date).toLocaleString()}</div>
                            <div><strong>Status:</strong> {detailPO.Status}</div>
                            {detailPO.Expected_Delivery && <div><strong>Expected By:</strong> {new Date(detailPO.Expected_Delivery).toLocaleDateString()}</div>}
                            {detailPO.Remarks && <div><strong>Remarks:</strong> {detailPO.Remarks}</div>}
                        </div>
                        <table style={{ width: '100%' }}>
                            <thead><tr><th style={{ padding: '8px 0' }}>Part No</th><th>Name</th><th>Ordered</th><th>Received</th><th>Price</th></tr></thead>
                            <tbody>
                                {detailPO.items.map(it => (
                                    <tr key={it.id}>
                                        <td style={{ padding: '8px 0' }} className="td-mono">{it.Part_Number}</td>
                                        <td>{it.Part_Name || '-'}</td>
                                        <td>{it.Quantity_Ordered}</td>
                                        <td><span className={it.Quantity_Received >= it.Quantity_Ordered ? "text-success" : ""}>{it.Quantity_Received}</span></td>
                                        <td>Rp. {it.Unit_Price}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDetailPO(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirm Status Modal */}
            {confirmModal && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(null); }}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                Confirm Action
                            </div>
                            <button className="btn btn-ghost" onClick={() => setConfirmModal(null)}><XCircle size={20} /></button>
                        </div>
                        <div style={{ padding: '20px 0', lineHeight: 1.5, fontSize: 16 }}>
                            Are you sure you want to mark PO <strong>{confirmModal.id}</strong> as <strong>{confirmModal.stat}</strong>?
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={() => executeStatusChange(confirmModal.id, confirmModal.stat)}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Modal */}
            {errorModalMsg && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setErrorModalMsg(''); }}>
                    <div className="modal" style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <XCircle size={18} /> Error
                            </div>
                            <button className="btn btn-ghost" onClick={() => setErrorModalMsg('')}><XCircle size={20} /></button>
                        </div>
                        <div style={{ padding: '20px 0', lineHeight: 1.5 }}>
                            {errorModalMsg}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={() => setErrorModalMsg('')}>Understood</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm PO Creation Modal */}
            {showCreateConfirm && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setShowCreateConfirm(false); }}>
                    <div className="modal" style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={18} color="var(--warning)" />
                                Confirm PO Creation
                            </div>
                            <button className="btn btn-ghost" onClick={() => setShowCreateConfirm(false)}>✕</button>
                        </div>
                        <div style={{ padding: '20px 0', lineHeight: 1.6, fontSize: 15 }}>
                            Are you sure you want to create Purchase Order <strong>{poNumber}</strong> from PR <strong>{prNumber}</strong> with <strong>{items.filter(i => i.Part_Number && i.Quantity > 0).length} item(s)</strong>?
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCreateConfirm(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={executeCreatePO}>
                                <FileCheck size={14} /> Create PO
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
