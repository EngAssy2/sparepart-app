import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PackagePlus, Plus, X, Search, AlertTriangle } from 'lucide-react';
import config from '../../config.json';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(weekOfYear);

export default function StockInPage() {
    const { user } = useAuth();
    const [availableParts, setAvailableParts] = useState([]);
    
    // Default item prepopulating user's section
    const [items, setItems] = useState([{ Part_Number: '', Quantity: 1, Section: user?.User_Section || '', Model: '' }]);
    
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Sync section if user context loads later
    useEffect(() => {
        if (user?.User_Section && items.length === 1 && !items[0].Section) {
            setItems([{ ...items[0], Section: user.User_Section }]);
        }
    }, [user]);

    // Load datalist
    useEffect(() => {
        client.get('/parts/lite')
            .then(res => setAvailableParts(Array.isArray(res.data) ? res.data : []))
            .catch(() => {});
    }, []);

    const updateItem = (idx, field, value) => {
        const updated = [...items];
        updated[idx][field] = value;
        setItems(updated);
    };

    // Trim a text field in a specific item row on blur
    const trimItemField = (idx, field) => {
        setItems(prev => {
            const updated = [...prev];
            if (typeof updated[idx][field] === 'string') {
                updated[idx][field] = updated[idx][field].trim();
            }
            return updated;
        });
    };

    const addItem = () => {
        setItems([...items, { Part_Number: '', Quantity: 1, Section: user?.User_Section || '', Model: '' }]);
    };

    const removeItem = (idx) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Trim all string fields before processing
        const trimmedItems = items.map(it => ({
            ...it,
            Part_Number: typeof it.Part_Number === 'string' ? it.Part_Number.trim() : it.Part_Number,
        }));
        setItems(trimmedItems);

        const validItems = trimmedItems.filter(i => i.Part_Number && i.Quantity > 0);
        if (validItems.length === 0) {
            setError('Please add at least one valid item.');
            return;
        }

        // Validate items
        for (let i = 0; i < validItems.length; i++) {
            const it = validItems[i];
            if (!it.Section) {
                setError(`Item ${i + 1} (${it.Part_Number}): Please select a Section.`);
                return;
            }
            if (!it.Model) {
                setError(`Item ${i + 1} (${it.Part_Number}): Please select a Model.`);
                return;
            }
            const matchedPart = availableParts.find(p => p.Part_Number === it.Part_Number);
            if (!matchedPart) {
                setError(`Item ${i + 1} (${it.Part_Number}): Part number not found in system.`);
                return;
            }
        }
        setShowConfirm(true);
    };

    const executeSubmit = async () => {
        setShowConfirm(false);
        const validItems = items.filter(i => i.Part_Number && i.Quantity > 0);
        setSubmitting(true);
        try {
            const validItemsPayload = validItems.map(it => ({ ...it, Machine_Name: it.Model }));
            const res = await client.post('/transactions/stock-in', { items: validItemsPayload });
            setSuccess(`Stock In recorded! Processed ${res.data.totalProcessed} item(s).`);
            setItems([{ Part_Number: '', Quantity: 1, Section: user?.User_Section || '', Model: '' }]);
            
            // Refresh parts to get updated quantities
            const partsRes = await client.get('/parts/lite');
            setAvailableParts(Array.isArray(partsRes.data) ? partsRes.data : []);
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Failed to record Stock In.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
        <AppShell title="Stock In">
            <div className="page-header">
                <div>
                    <div className="page-title">Stock In</div>
                    <div className="page-subtitle">Add inventory quantities to spare parts</div>
                </div>
            </div>

            <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                <div className="card">
                    <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') e.preventDefault(); }}>
                        
                        <div className="public-stockout-items-section" style={{ background: 'transparent', padding: '0 0 16px 0', border: 'none' }}>
                            <div className="public-stockout-items-header">Multiple Part Addition</div>

                            {/* Column Labels */}
                            <div className="public-stockout-item-labels" style={{ marginTop: 12 }}>
                                <div style={{ flex: 2 }}>Part Number</div>
                                <div style={{ width: 90 }}>Qty</div>
                                <div style={{ flex: 1.5 }}>Section</div>
                                <div style={{ flex: 2 }}>Model</div>
                                <div style={{ width: 40 }}></div>
                            </div>

                            {items.map((item, idx) => {
                                const matchedPart = availableParts.find(p => p.Part_Number === item.Part_Number);
                                const partName = matchedPart ? matchedPart.Part_Name : '';
                                const stockQty = matchedPart ? matchedPart.Quantity : null;

                                return (
                                    <div key={idx} className="public-stockout-item-row" style={{ alignItems: 'flex-start' }}>
                                        <div style={{ flex: 2 }}>
                                            <input
                                                className="input"
                                                list="internal-parts-list"
                                                placeholder="Part Number"
                                                value={item.Part_Number}
                                                onChange={e => updateItem(idx, 'Part_Number', e.target.value)}
                                                onBlur={() => trimItemField(idx, 'Part_Number')}
                                                required
                                            />
                                            {partName && (
                                                <div className="field-hint" style={{ color: 'var(--primary)', marginTop: 4 }}>
                                                    {partName} · Stock: <span style={{ color: stockQty > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{stockQty}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ width: 90 }}>
                                            <input
                                                className="input"
                                                type="number"
                                                min="1"
                                                placeholder="Qty"
                                                value={item.Quantity}
                                                onChange={e => updateItem(idx, 'Quantity', parseInt(e.target.value) || 1)}
                                                required
                                            />
                                        </div>
                                        <div style={{ flex: 1.5 }}>
                                            <select
                                                className="input"
                                                value={item.Section}
                                                disabled
                                                style={{ opacity: 0.8 }}
                                            >
                                                <option value="">{user?.User_Section || 'No Section'}</option>
                                            </select>
                                        </div>
                                        <div style={{ flex: 2 }}>
                                            <select
                                                className="input"
                                                value={item.Model}
                                                onChange={e => updateItem(idx, 'Model', e.target.value)}
                                                required
                                            >
                                                <option value="">Select Model...</option>
                                                {config.ModelList.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ width: 40, display: 'flex', alignItems: 'center', paddingTop: 8 }}>
                                            {items.length > 1 && (
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm btn-icon"
                                                    onClick={() => removeItem(idx)}
                                                    title="Remove item"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            
                            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem} style={{ marginTop: 8, gap: 6 }}>
                                <Plus size={14} /> Add items
                            </button>
                        </div>
                        
                        <datalist id="internal-parts-list">
                            {availableParts.map(p => (
                                <option key={p.Part_Number} value={p.Part_Number}>{p.Part_Name}</option>
                            ))}
                        </datalist>

                        <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontSize: 13, marginTop: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Date</span>
                                <span style={{ fontWeight: 500 }}>{dayjs().format('MMM D, YYYY')}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Work Week</span>
                                <span style={{ fontWeight: 500 }}>WW{dayjs().week()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Operator</span>
                                <span style={{ fontWeight: 500 }}>{user?.User_name}</span>
                            </div>
                        </div>

                        {error && <div className="alert alert-danger" style={{ marginTop: 16 }}>{error}</div>}
                        {success && <div className="alert alert-success" style={{ marginTop: 16 }}>{success}</div>}

                        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-success btn-lg" type="submit" disabled={submitting}>
                                {submitting
                                    ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Processing…</>
                                    : <><PackagePlus size={16} /> Finalize Stock In</>
                                }
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </AppShell>

        {/* Confirm Stock In Modal */}
        {showConfirm && (
            <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}>
                <div className="modal" style={{ maxWidth: 420 }}>
                    <div className="modal-header">
                        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={18} color="var(--warning)" />
                            Confirm Stock In
                        </div>
                        <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>✕</button>
                    </div>
                    <div style={{ padding: '20px 0', lineHeight: 1.6, fontSize: 15 }}>
                        Are you sure you want to stock in <strong>{items.filter(i => i.Part_Number && i.Quantity > 0).length} item(s)</strong>?
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
                        <button className="btn btn-success" onClick={executeSubmit} disabled={submitting}>
                            {submitting ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Processing…</> : <><PackagePlus size={14} /> Confirm</>}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
    );
}
