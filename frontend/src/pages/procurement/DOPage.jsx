import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import AppShell from '../../components/layout/AppShell';
import { Truck, Plus, XCircle, Eye, CheckCircle, Search } from 'lucide-react';

export default function DOPage() {
    const { token } = useAuth();
    const [dos, setDos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [detailDO, setDetailDO] = useState(null);

    // Notifications & Confirmations
    const [errorModalMsg, setErrorModalMsg] = useState('');
    const [successModalMsg, setSuccessModalMsg] = useState('');
    const [confirmModal, setConfirmModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Form state
    const [poNumber, setPoNumber] = useState('');
    const [doNumber, setDoNumber] = useState('');
    const [supplierRef, setSupplierRef] = useState('');
    const [remarks, setRemarks] = useState('');
    const [poData, setPoData] = useState(null);
    const [itemsToReceive, setItemsToReceive] = useState([]);
    const [fetchPoError, setFetchPoError] = useState('');

    const fetchDOs = async () => {
        try {
            const res = await fetch('/api/procurement/do', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) setDos((await res.json()).data);
        } catch (err) {}
        setLoading(false);
    };

    useEffect(() => { fetchDOs(); }, [token]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setShowModal(false);
                setDetailDO(null);
                setConfirmModal(false);
                setErrorModalMsg('');
                setSuccessModalMsg('');
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const handleFetchPO = async () => {
        setFetchPoError('');
        try {
            const res = await fetch(`/api/procurement/po/${poNumber}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setPoData(data);
                // Pre-fill receive quantities with the remaining amount
                setItemsToReceive(data.items.map(it => ({
                    PO_Item_ID: it.id,
                    Part_Number: it.Part_Number,
                    Part_Name: it.Part_Name,
                    Ordered: it.Quantity_Ordered,
                    Previously_Received: it.Quantity_Received,
                    Quantity_Delivered: Math.max(0, it.Quantity_Ordered - it.Quantity_Received),
                    Condition_Status: 'Good'
                })));
            } else {
                setFetchPoError('PO not found');
            }
        } catch (err) {}
    };

    const triggerCreateDO = (e) => {
        e.preventDefault();
        const validItems = itemsToReceive.filter(i => i.Quantity_Delivered > 0);
        if (!validItems.length) {
            setErrorModalMsg('No items being received (quantity > 0)');
            return;
        }
        setConfirmModal(true);
    };

    const executeCreateDO = async () => {
        setConfirmModal(false);
        const validItems = itemsToReceive.filter(i => i.Quantity_Delivered > 0);
        // Trim string fields before submitting
        const cleanDoNumber = doNumber.trim();
        const cleanSupplierRef = supplierRef.trim();
        const cleanRemarks = remarks.trim();
        
        try {
            const res = await fetch('/api/procurement/do', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ 
                    DO_Number: cleanDoNumber,
                    PO_Number: poNumber.trim(), 
                    Supplier_DO_Ref: cleanSupplierRef, 
                    Remarks: cleanRemarks, 
                    items: validItems 
                })
            });
            if (res.ok) {
                setShowModal(false);
                setDoNumber('');
                setSupplierRef('');
                setRemarks('');
                setPoData(null);
                setItemsToReceive([]);
                fetchDOs();
                setSuccessModalMsg('Delivery Order recorded, Masterdata inventory automatically updated!');
            } else {
                const errorData = await res.json();
                setErrorModalMsg(errorData.error || 'Error creating DO');
            }
        } catch (err) {
            setErrorModalMsg('Network or server error occurred.');
        }
    };

    const openDetail = async (id) => {
        try {
            const res = await fetch(`/api/procurement/do/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) setDetailDO(await res.json());
        } catch (err) {}
    };

    return (
        <AppShell title="Delivery Orders">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Delivery Orders</h1>
                    <div className="page-subtitle">Receive incoming stock from suppliers against POs</div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Truck size={16} /> Receive Delivery
                </button>
            </div>

            <div className="filter-bar" style={{ marginBottom: 20 }}>
                <div className="input-wrap" style={{ flex: 1, maxWidth: 350 }}>
                    <Search size={14} className="input-icon" />
                    <input
                        className="input"
                        placeholder="Search DO Number, Ref PO, or Supplier Ref..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="card table-wrap">
                {loading ? <div style={{padding: 20}}>Loading...</div> : (
                    <table>
                        <thead>
                            <tr>
                                <th>DO Number</th>
                                <th>Ref PO</th>
                                <th>Date Received</th>
                                <th>Supplier Ref</th>
                                <th>Receiver</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dos.filter(do_item => {
                                if (!searchTerm) return true;
                                const term = searchTerm.toLowerCase();
                                return do_item.DO_Number.toLowerCase().includes(term) ||
                                       do_item.PO_Number?.toLowerCase().includes(term) ||
                                       do_item.Supplier_DO_Ref?.toLowerCase().includes(term);
                            }).map(do_item => (
                                <tr key={do_item.DO_Number}>
                                    <td className="td-mono">{do_item.DO_Number}</td>
                                    <td className="td-mono">{do_item.PO_Number}</td>
                                    <td>{new Date(do_item.Delivery_Date).toLocaleString()}</td>
                                    <td>{do_item.Supplier_DO_Ref || '-'}</td>
                                    <td>{do_item.Receiver_Name}</td>
                                    <td>
                                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openDetail(do_item.DO_Number)}>
                                            <Eye size={14} /> View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {dos.length === 0 && <tr><td colSpan="6" className="empty-state">No Delivery Orders found.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Receive DO Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
                    <div className="modal modal-lg" style={{maxWidth: 800}}>
                        <div className="modal-header">
                            <div className="modal-title">Record Incoming Delivery (DO)</div>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}><XCircle size={20}/></button>
                        </div>
                        
                        {!poData ? (
                            <div className="form-group" style={{marginBottom: 20}}>
                                <label className="form-label">Enter PO Number to Receive Against</label>
                                <div style={{display:'flex', gap: 10}}>
                                    <input className="input" placeholder="e.g. PO-00001" value={poNumber} onChange={e => setPoNumber(e.target.value)} />
                                    <button className="btn btn-primary" onClick={handleFetchPO}>Lookup PO</button>
                                </div>
                                {fetchPoError && <div style={{color:'var(--danger)', marginTop: 5}}>{fetchPoError}</div>}
                            </div>
                        ) : (
                            <form onSubmit={triggerCreateDO} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') e.preventDefault(); }}>
                                <div style={{marginBottom: 20, padding: 15, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)'}}>
                                    <strong>Receiving for PO:</strong> {poData.PO_Number} <br/>
                                    <strong>Supplier:</strong> {poData.Supplier} 
                                </div>

                                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 15, marginBottom: 15}}>
                                    <div className="form-group">
                                        <label className="form-label required">DO Number (Internal)</label>
                                        <input className="input" placeholder="e.g. DO-2023-01" value={doNumber} onChange={e => setDoNumber(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label required">Supplier DO Reference</label>
                                        <input className="input" placeholder="Supplier Invoice/DO #" value={supplierRef} onChange={e => setSupplierRef(e.target.value)} required />
                                    </div>
                                </div>
                                <div className="form-group" style={{marginBottom: 15}}>
                                    <label className="form-label">Remarks regarding delivery</label>
                                    <input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} />
                                </div>
                                
                                <div style={{fontWeight: 600, marginBottom: 10}}>Receive Quantities</div>
                                <table style={{width:'100%', marginBottom: 20}}>
                                    <thead><tr>
                                        <th>Part</th>
                                        <th>Expected Remainder</th>
                                        <th>Receiving Qty</th>
                                        <th>Condition</th>
                                    </tr></thead>
                                    <tbody>
                                        {itemsToReceive.map((it, idx) => (
                                            <tr key={it.PO_Item_ID}>
                                                <td>{it.Part_Number} - {it.Part_Name}</td>
                                                <td>{it.Ordered - it.Previously_Received} left</td>
                                                <td>
                                                    <input 
                                                        type="number" className="input" style={{width: 80}} 
                                                        min="0"
                                                        value={it.Quantity_Delivered} 
                                                        onChange={e => { const n = [...itemsToReceive]; n[idx].Quantity_Delivered = parseInt(e.target.value)||0; setItemsToReceive(n); }} 
                                                    />
                                                </td>
                                                <td>
                                                    <select className="select-ctrl" style={{width: 100}} value={it.Condition_Status} onChange={e => { const n = [...itemsToReceive]; n[idx].Condition_Status = e.target.value; setItemsToReceive(n); }}>
                                                        <option value="Good">Good</option>
                                                        <option value="Damaged">Damaged</option>
                                                        <option value="Wrong Item">Wrong Item</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setPoData(null)}>Back to PO Search</button>
                                    <button type="submit" className="btn btn-success">Verify & Stock In</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* DO Detail Modal */}
            {detailDO && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetailDO(null); }}>
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <div className="modal-title">DO Details: {detailDO.DO_Number}</div>
                            <button className="btn btn-ghost" onClick={() => setDetailDO(null)}><XCircle size={20}/></button>
                        </div>
                        <div style={{marginBottom: 20}}>
                            <div><strong>Ref PO:</strong> {detailDO.PO_Number}</div>
                            <div><strong>Supplier Ref:</strong> {detailDO.Supplier_DO_Ref || '-'}</div>
                            <div><strong>Date:</strong> {new Date(detailDO.Delivery_Date).toLocaleString()}</div>
                            <div><strong>Received By:</strong> {detailDO.Receiver_Name}</div>
                            {detailDO.Remarks && <div><strong>Remarks:</strong> {detailDO.Remarks}</div>}
                        </div>
                        <table style={{width: '100%'}}>
                            <thead><tr><th style={{padding: '8px 0'}}>Part No</th><th>Name</th><th>Received Qty</th><th>Condition</th></tr></thead>
                            <tbody>
                               {detailDO.items.map(it => (
                                   <tr key={it.id}>
                                       <td style={{padding: '8px 0'}} className="td-mono">{it.Part_Number}</td>
                                       <td>{it.Part_Name || '-'}</td>
                                       <td>{it.Quantity_Delivered}</td>
                                       <td>{it.Condition_Status}</td>
                                   </tr>
                               ))}
                            </tbody>
                        </table>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDetailDO(null)}>Close</button>
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

            {/* Success Modal */}
            {successModalMsg && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setSuccessModalMsg(''); }}>
                    <div className="modal" style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircle size={18} /> Success
                            </div>
                            <button className="btn btn-ghost" onClick={() => setSuccessModalMsg('')}><XCircle size={20} /></button>
                        </div>
                        <div style={{ padding: '20px 0', lineHeight: 1.5 }}>
                            {successModalMsg}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={() => setSuccessModalMsg('')}>OK</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Modal */}
            {confirmModal && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(false); }}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                Confirm Action
                            </div>
                            <button className="btn btn-ghost" onClick={() => setConfirmModal(false)}><XCircle size={20} /></button>
                        </div>
                        <div style={{ padding: '20px 0', lineHeight: 1.5, fontSize: 16 }}>
                            Are you sure you want to record this Delivery Order? This will automatically update the Masterdata inventory.
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setConfirmModal(false)}>Cancel</button>
                            <button 
                                className="btn btn-success"
                                onClick={executeCreateDO}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
