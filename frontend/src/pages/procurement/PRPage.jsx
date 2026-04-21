import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import AppShell from '../../components/layout/AppShell';
import { Plus, CheckCircle, XCircle, FileText, Eye, Search, AlertTriangle } from 'lucide-react';

export default function PRPage() {
    const { token, level, user } = useAuth();
    const [prs, setPrs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [detailPR, setDetailPR] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Form state
    const [prNumber, setPrNumber] = useState('');
    const [remarks, setRemarks] = useState('');
    const [quotationFile, setQuotationFile] = useState(null);
    const [items, setItems] = useState([{ Part_Number: '', Quantity: 1, Reason: '' }]);
    const [availableParts, setAvailableParts] = useState([]);
    const [errorModalMsg, setErrorModalMsg] = useState('');
    const [confirmModal, setConfirmModal] = useState(null);
    const [showCreateConfirm, setShowCreateConfirm] = useState(false);

    const fetchPRs = async () => {
        try {
            const res = await fetch('/api/procurement/pr', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const json = await res.json();
                setPrs(json.data);
            }
        } catch (err) { }
        setLoading(false);
    };

    useEffect(() => { fetchPRs(); }, [token]);

    useEffect(() => {
        if (showModal && availableParts.length === 0) {
            fetch('/api/parts/lite', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(res => res.json())
                .then(data => {
                    const parts = Array.isArray(data) ? data : [];
                    setAvailableParts(parts);
                }).catch(() => { });
        }
    }, [showModal, token, availableParts.length]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setShowModal(false);
                setDetailPR(null);
                setConfirmModal(null);
                setShowCreateConfirm(false);
                setErrorModalMsg('');
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const handleCreatePR = (e) => {
        e.preventDefault();
        const validItems = items.filter(i => i.Part_Number && i.Quantity > 0);
        if (!validItems.length) {
            setErrorModalMsg('Please add at least one valid item to the request.');
            return;
        }
        setShowCreateConfirm(true);
    };

    const executeCreatePR = async () => {
        setShowCreateConfirm(false);
        const validItems = items.filter(i => i.Part_Number && i.Quantity > 0);
        try {
            const res = await fetch('/api/procurement/pr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ PR_Number: prNumber, Remarks: remarks, items: validItems })
            });
            if (res.ok) {
                if (quotationFile) {
                    const fd = new FormData();
                    fd.append('prNumber', prNumber);
                    fd.append('file', quotationFile);
                    try {
                        await fetch('/api/files/quotation', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: fd
                        });
                    } catch (e) {}
                }

                setShowModal(false);
                setPrNumber('');
                setRemarks('');
                setQuotationFile(null);
                setItems([{ Part_Number: '', Quantity: 1, Reason: '' }]);
                fetchPRs();
            } else {
                const errorData = await res.json();
                setErrorModalMsg(errorData.error || 'An error occurred while creating the PR.');
            }
        } catch (err) { 
            setErrorModalMsg('Network or server error occurred.');
        }
    };

    const executeStatusChange = async (id, stat) => {
        try {
            const res = await fetch(`/api/procurement/pr/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ Status: stat })
            });
            if (res.ok) {
                setConfirmModal(null);
                fetchPRs();
            } else {
                const errorData = await res.json();
                setConfirmModal(null);
                setErrorModalMsg(errorData.error || 'Failed to update PR status');
            }
        } catch (err) {
            setConfirmModal(null);
            setErrorModalMsg('Network or server error occurred.');
        }
    };

    const openDetail = async (id) => {
        try {
            const res = await fetch(`/api/procurement/pr/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setDetailPR(await res.json());
            }
        } catch (err) { }
    };

    return (
        <AppShell title="Purchase Requests">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Purchase Requests</h1>
                    <div className="page-subtitle">Track and manage internal requests for spare parts</div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={16} /> New PR
                </button>
            </div>

            <div className="filter-bar" style={{ marginBottom: 20 }}>
                <div className="input-wrap" style={{ flex: 1, maxWidth: 350 }}>
                    <Search size={14} className="input-icon" />
                    <input
                        className="input"
                        placeholder="Search PR Number, Requester, or Status..."
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
                                <th>PR Number</th>
                                <th>Date</th>
                                <th>Requester</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {prs.filter(pr => {
                                if (!searchTerm) return true;
                                const term = searchTerm.toLowerCase();
                                return pr.PR_Number.toLowerCase().includes(term) ||
                                       pr.Requester_Name?.toLowerCase().includes(term) ||
                                       pr.Status.toLowerCase().includes(term);
                            }).map(pr => (
                                <tr key={pr.PR_Number}>
                                    <td className="td-mono">{pr.PR_Number}</td>
                                    <td>{new Date(pr.Request_Date).toLocaleDateString()}</td>
                                    <td>{pr.Requester_Name} ({pr.Requester_Badge})</td>
                                    <td>
                                        <span className={`badge ${pr.Status === 'Approved' || pr.Status === 'PO Created' ? 'badge-success' : pr.Status === 'Rejected' ? 'badge-danger' : 'badge-warning'}`}>
                                            {pr.Status}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 5 }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" title="View Details" onClick={() => openDetail(pr.PR_Number)}>
                                                <Eye size={14} />
                                            </button>
                                            {level <= 2 && pr.Status === 'Pending Review' && (
                                                <>
                                                    <button className="btn btn-success btn-sm btn-icon" title="Approve" onClick={() => setConfirmModal({id: pr.PR_Number, stat: 'Approved'})}>
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button className="btn btn-danger btn-sm btn-icon" title="Reject" onClick={() => setConfirmModal({id: pr.PR_Number, stat: 'Rejected'})}>
                                                        <XCircle size={14} />
                                                    </button>
                                                </>
                                            )}
                                            {((pr.Status === 'Pending Review' || pr.Status === 'Approved') && (level <= 2 || pr.Requester_Badge === user?.badge)) && (
                                                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 5 }} title="Cancel PR" onClick={() => setConfirmModal({id: pr.PR_Number, stat: 'Cancelled'})}>
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {prs.length === 0 && <tr><td colSpan="5" className="empty-state">No Purchase Requests found.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create PR Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <div className="modal-title">New Purchase Request</div>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}><XCircle size={20} /></button>
                        </div>
                        <form onSubmit={handleCreatePR} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') e.preventDefault(); }}>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label required">PR Number</label>
                                <input className="input" placeholder="e.g. PR-2023-01" value={prNumber} onChange={e => setPrNumber(e.target.value)} required />
                            </div>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Attach Quotation (PDF)</label>
                                <input type="file" className="input" accept="application/pdf" onChange={e => setQuotationFile(e.target.files[0])} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Remarks / Justification</label>
                                <textarea className="textarea-ctrl" value={remarks} onChange={e => setRemarks(e.target.value)} />
                            </div>

                            <div style={{ fontWeight: 600, marginBottom: 10 }}>Requested Items</div>
                            {items.map((it, idx) => {
                                const matchedPart = availableParts.find(p => p.Part_Number === it.Part_Number);
                                const partName = matchedPart ? matchedPart.Part_Name : '';
                                return (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 15 }}>
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <input className="input" list="part-numbers-list" placeholder="Part Number" value={it.Part_Number} onChange={e => { const n = [...items]; n[idx].Part_Number = e.target.value; setItems(n); }} required />
                                                {partName && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{partName}</div>}
                                            </div>
                                            <input type="number" className="input" style={{ width: 100 }} placeholder="Qty" value={it.Quantity} min="1" onChange={e => { const n = [...items]; n[idx].Quantity = e.target.value; setItems(n); }} required />
                                            <div style={{ flex: 1 }}>
                                                <input className="input" placeholder="Reason (Optional)" value={it.Reason} onChange={e => { const n = [...items]; n[idx].Reason = e.target.value; setItems(n); }} />
                                            </div>
                                            {idx > 0 && (
                                                <button type="button" className="btn btn-danger" onClick={() => setItems(items.filter((_, i) => i !== idx))}>X</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems([...items, { Part_Number: '', Quantity: 1, Reason: '' }])}>+ Add Item</button>

                            <datalist id="part-numbers-list">
                                {availableParts.map(p => (
                                    <option key={p.Part_Number} value={p.Part_Number}>{p.Part_Number}</option>
                                ))}
                            </datalist>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Submit PR</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PR Detail Modal */}
            {detailPR && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetailPR(null); }}>
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <div className="modal-title">PR Details: {detailPR.PR_Number}</div>
                            <button className="btn btn-ghost" onClick={() => setDetailPR(null)}><XCircle size={20} /></button>
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <div><strong>Requester:</strong> {detailPR.Requester_Name} ({detailPR.Requester_Badge})</div>
                            <div><strong>Date:</strong> {new Date(detailPR.Request_Date).toLocaleString()}</div>
                            <div><strong>Status:</strong> {detailPR.Status}</div>
                            {detailPR.Remarks && <div><strong>Remarks:</strong> {detailPR.Remarks}</div>}
                        </div>
                        <table style={{ width: '100%' }}>
                            <thead><tr><th style={{ padding: '8px 0' }}>Part No</th><th>Name</th><th>Qty</th><th>Reason</th></tr></thead>
                            <tbody>
                                {detailPR.items.map(it => (
                                    <tr key={it.id}>
                                        <td style={{ padding: '8px 0' }} className="td-mono">{it.Part_Number}</td>
                                        <td>{it.Part_Name || '-'}</td>
                                        <td>{it.Quantity}</td>
                                        <td>{it.Reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ marginTop: 20 }}>
                            <a 
                                href={`/api/files/quotations/${detailPR.PR_Number}.pdf`}
                                target="_blank" rel="noreferrer"
                                className="btn btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                                📄 View PDF Quotation
                            </a>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDetailPR(null)}>Close</button>
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
                                <XCircle size={18} /> Submission Error
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
                            Are you sure you want to mark PR <strong>{confirmModal.id}</strong> as <strong>{confirmModal.stat}</strong>?
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
                            <button 
                                className={`btn ${confirmModal.stat === 'Rejected' || confirmModal.stat === 'Cancelled' ? 'btn-danger' : 'btn-success'}`} 
                                onClick={() => executeStatusChange(confirmModal.id, confirmModal.stat)}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirm PR Creation Modal */}
            {showCreateConfirm && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setShowCreateConfirm(false); }}>
                    <div className="modal" style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={18} color="var(--warning)" />
                                Confirm PR Submission
                            </div>
                            <button className="btn btn-ghost" onClick={() => setShowCreateConfirm(false)}>✕</button>
                        </div>
                        <div style={{ padding: '20px 0', lineHeight: 1.6, fontSize: 15 }}>
                            Are you sure you want to submit Purchase Request <strong>{prNumber}</strong> with <strong>{items.filter(i => i.Part_Number && i.Quantity > 0).length} item(s)</strong>?
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCreateConfirm(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={executeCreatePR}>
                                <FileText size={14} /> Submit PR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
