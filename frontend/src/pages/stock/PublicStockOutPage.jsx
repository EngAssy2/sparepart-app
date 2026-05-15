import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, PackageMinus, CheckCircle, ArrowLeft, ScanLine, Camera, ScanText, AlertTriangle } from 'lucide-react';
import config from '../../config.json';
import * as visualSvc from '../../services/visualRecognition';

const API_BASE = '/api/public';

export default function PublicStockOutPage() {
    const navigate = useNavigate();
    const badgeRef = useRef(null);

    // Badge / user state
    const [badge, setBadge] = useState('');
    const [userName, setUserName] = useState('');
    const [userSection, setUserSection] = useState('');
    const [badgeVerified, setBadgeVerified] = useState(false);
    const [badgeError, setBadgeError] = useState('');
    const [lookingUp, setLookingUp] = useState(false);

    // Items
    const [items, setItems] = useState([{ Part_Number: '', Quantity: 1, Section: '', Model: '' }]);
    const [availableParts, setAvailableParts] = useState([]);

    // Submission
    const [submitting, setSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);

    // Visual Search State
    const [isVisualSearch, setIsVisualSearch] = useState(false);
    const [visualAtlas, setVisualAtlas] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [bestMatch, setBestMatch] = useState(null);
    const [targetItemIdx, setTargetItemIdx] = useState(null);
    const videoRef = useRef(null);
    const scanTimerRef = useRef(null);

    // Load parts for datalist
    useEffect(() => {
        fetch(`${API_BASE}/parts/lite`)
            .then(res => res.json())
            .then(data => setAvailableParts(Array.isArray(data) ? data : []))
            .catch(() => {});

        // Load atlas
        fetch(`${API_BASE}/embeddings/atlas`)
            .then(res => { if (res.ok) return res.json(); throw new Error(); })
            .then(data => setVisualAtlas(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, []);

    // Badge lookup with debounce
    useEffect(() => {
        if (!badge || badge.length < 2) {
            setUserName('');
            setUserSection('');
            setBadgeVerified(false);
            setBadgeError('');
            return;
        }
        const timer = setTimeout(async () => {
            setLookingUp(true);
            setBadgeError('');
            try {
                const res = await fetch(`${API_BASE}/user/${encodeURIComponent(badge)}`);
                if (res.ok) {
                    const data = await res.json();
                    setUserName(data.User_Name);
                    const section = data.User_Section || '';
                    setUserSection(section);
                    setBadgeVerified(true);
                    setBadgeError('');
                    
                    // Auto-fill existing items with this section
                    setItems(prev => prev.map(item => ({ ...item, Section: section })));
                } else {
                    setUserName('');
                    setUserSection('');
                    setBadgeVerified(false);
                    setBadgeError('Badge not found in system');
                }
            } catch {
                setBadgeError('Connection error');
                setBadgeVerified(false);
            } finally {
                setLookingUp(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [badge]);

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
        setItems([...items, { Part_Number: '', Quantity: 1, Section: userSection, Model: '' }]);
    };

    const removeItem = (idx) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    // Visual Search Logic
    const startVisualSearch = async (idx) => {
        setTargetItemIdx(idx);
        setIsVisualSearch(true);
        setErrorMsg('');
        try {
            await visualSvc.loadModel();
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsScanning(true);
            }
        } catch (err) {
            setErrorMsg('Camera access denied or error loading AI model.');
            setIsVisualSearch(false);
        }
    };

    const stopVisualSearch = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        }
        setIsVisualSearch(false);
        setIsScanning(false);
        setBestMatch(null);
        setTargetItemIdx(null);
        if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };

    useEffect(() => {
        if (isScanning && isVisualSearch) {
            scanTimerRef.current = setInterval(async () => {
                if (videoRef.current && videoRef.current.readyState >= 2) {
                    try {
                        const emb = await visualSvc.getEmbedding(videoRef.current);
                        const matches = visualSvc.findMatches(emb, visualAtlas, 1);
                        if (matches.length > 0) {
                            const match = matches[0];
                            setBestMatch(match);
                            // Auto-select if very confident
                            if (match.score > 0.92) {
                                selectPart(match.Part_Number);
                            }
                        }
                    } catch (e) {
                         // silently recover from frame drops
                    }
                }
            }, 600);
        } else {
            if (scanTimerRef.current) clearInterval(scanTimerRef.current);
        }
        return () => { if (scanTimerRef.current) clearInterval(scanTimerRef.current); };
    }, [isScanning, isVisualSearch, visualAtlas]);

    const selectPart = (partNum) => {
        if (targetItemIdx !== null) {
            updateItem(targetItemIdx, 'Part_Number', partNum);
        }
        stopVisualSearch();
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (!badgeVerified) {
            setErrorMsg('Please scan a valid badge number first.');
            return;
        }

        // Trim all string fields before processing
        const trimmedItems = items.map(it => ({
            ...it,
            Part_Number: typeof it.Part_Number === 'string' ? it.Part_Number.trim() : it.Part_Number,
        }));
        setItems(trimmedItems);

        const validItems = trimmedItems.filter(i => i.Part_Number && i.Quantity > 0);
        if (validItems.length === 0) {
            setErrorMsg('Please add at least one valid item.');
            return;
        }

        // Validate each item has section and model
        for (let i = 0; i < validItems.length; i++) {
            const it = validItems[i];
            if (it.Quantity <= 0) {
                setErrorMsg(`Item ${i + 1}: Quantity must be greater than 0.`);
                return;
            }
            if (!it.Section) {
                setErrorMsg(`Item ${i + 1} (${it.Part_Number}): Please select a Section.`);
                return;
            }
            if (!it.Model) {
                setErrorMsg(`Item ${i + 1} (${it.Part_Number}): Please select a Model.`);
                return;
            }
            const matchedPart = availableParts.find(p => p.Part_Number === it.Part_Number);
            if (matchedPart && it.Quantity > matchedPart.Quantity) {
                setErrorMsg(`Item ${i + 1} (${it.Part_Number}): Quantity (${it.Quantity}) exceeds available stock (${matchedPart.Quantity}).`);
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
            const res = await fetch(`${API_BASE}/stock-out`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ badge, name: userName, items: validItems })
            });
            const data = await res.json();
            if (res.ok) {
                setSuccessMsg(`Stock out recorded successfully! ${data.results.length} item(s) processed.`);
                setItems([{ Part_Number: '', Quantity: 1, Section: '', Model: '' }]);
                setBadge('');
                setUserName('');
                setUserSection('');
                setBadgeVerified(false);
                if (badgeRef.current) badgeRef.current.focus();
            } else {
                setErrorMsg(data.error || 'Failed to record stock out.');
            }
        } catch {
            setErrorMsg('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
        <div className="public-stockout-page">
            <div className="public-stockout-container">
                {/* Header */}
                <div className="public-stockout-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button className="btn btn-ghost" onClick={() => navigate('/login')} style={{ gap: 6 }}>
                            <ArrowLeft size={16} /> Back to Login
                        </button>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.5 }}>v{__APP_VERSION__}</span>
                    </div>
                    <div className="public-stockout-title-row">
                        <div className="public-stockout-icon">
                            <PackageMinus size={28} />
                        </div>
                        <div>
                            <h1 className="public-stockout-title">Stock Out</h1>
                            <p className="public-stockout-subtitle">Quick spare part withdrawal — no login required</p>
                        </div>
                    </div>
                </div>

                {/* Form Card */}
                <div className="card public-stockout-card">
                    <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') e.preventDefault(); }}>

                        {/* Badge + Name + Section Row */}
                        <div className="public-stockout-badge-row" style={{ display: 'flex', gap: 12 }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label required">
                                    <ScanLine size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                    Scan Badge
                                </label>
                                <input
                                    ref={badgeRef}
                                    className="input"
                                    placeholder="Scan or type badge number"
                                    value={badge}
                                    onChange={e => setBadge(e.target.value.trim())}
                                    autoFocus
                                    autoComplete="off"
                                    style={{
                                        borderColor: badgeVerified ? 'var(--success)' : badgeError ? 'var(--danger)' : undefined,
                                    }}
                                />
                                {lookingUp && <div className="field-hint">Looking up...</div>}
                                {badgeError && <div className="field-hint field-hint-error">{badgeError}</div>}
                                {badgeVerified && <div className="field-hint field-hint-success">✓ Badge verified</div>}
                            </div>
                            <div className="form-group" style={{ flex: 1.5 }}>
                                <label className="form-label">Name</label>
                                <input
                                    className="input"
                                    value={userName}
                                    disabled
                                    placeholder="Auto-filled from badge"
                                    style={{ opacity: userName ? 1 : 0.5 }}
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label className="form-label">User Section</label>
                                <input
                                    className="input"
                                    value={userSection}
                                    disabled
                                    placeholder="Auto-filled"
                                    style={{ opacity: userSection ? 1 : 0.5 }}
                                />
                            </div>
                        </div>

                        {/* Items Section */}
                        <div className="public-stockout-items-section">
                            <div className="public-stockout-items-header">Requested Items</div>

                            {/* Column Labels */}
                            <div className="public-stockout-item-labels">
                                <div style={{ flex: 2 }}>Part Number</div>
                                <div style={{ width: 90 }}>Qty</div>
                                <div style={{ flex: 1 }}>Section</div>
                                <div style={{ flex: 1 }}>Model</div>
                                <div style={{ width: 40 }}></div>
                            </div>

                            {items.map((item, idx) => {
                                const matchedPart = availableParts.find(p => p.Part_Number === item.Part_Number);
                                const partName = matchedPart ? matchedPart.Part_Name : '';
                                const stockQty = matchedPart ? matchedPart.Quantity : null;
                                const overStock = stockQty !== null && item.Quantity > stockQty;
                                return (
                                    <div key={idx} className="public-stockout-item-row">
                                        <div style={{ flex: 2 }}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <input
                                                    className="input"
                                                    list="public-parts-list"
                                                    placeholder="Part Number"
                                                    value={item.Part_Number}
                                                    onChange={e => updateItem(idx, 'Part_Number', e.target.value)}
                                                    onBlur={() => trimItemField(idx, 'Part_Number')}
                                                    required
                                                    style={{ flex: 1 }}
                                                />
                                                <button type="button" className="btn btn-secondary btn-icon" onClick={() => startVisualSearch(idx)} title="Identify via Camera">
                                                    <Camera size={14} />
                                                </button>
                                            </div>
                                            {partName && (
                                                <div className="field-hint" style={{ color: 'var(--primary)' }}>
                                                    {partName} · Stock: <span style={{ color: stockQty > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{stockQty}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ width: 90 }}>
                                            <input
                                                className="input"
                                                type="number"
                                                min="1"
                                                max={stockQty ?? undefined}
                                                placeholder="Qty"
                                                value={item.Quantity}
                                                onChange={e => updateItem(idx, 'Quantity', parseInt(e.target.value) || 1)}
                                                required
                                                style={{ borderColor: overStock ? 'var(--danger)' : undefined }}
                                            />
                                            {overStock && (
                                                <div className="field-hint field-hint-error">Max: {stockQty}</div>
                                            )}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <select
                                                className="input"
                                                value={item.Section}
                                                disabled
                                                style={{ opacity: 0.8 }}
                                            >
                                                <option value="">{item.Section || 'Select Section...'}</option>
                                                {config.SectionList.map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <select
                                                className="input"
                                                value={item.Model}
                                                onChange={e => updateItem(idx, 'Model', e.target.value)}
                                                required
                                                style={{ borderColor: !item.Model ? undefined : 'var(--success)' }}
                                            >
                                                <option value="">Select Model...</option>
                                                {config.ModelList.map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ width: 40, display: 'flex', alignItems: 'flex-start', paddingTop: 4 }}>
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

                            <button type="button" className="btn btn-ghost btn-sm" onClick={addItem} style={{ marginTop: 4, gap: 6 }}>
                                <Plus size={14} /> Add items
                            </button>
                        </div>

                        <datalist id="public-parts-list">
                            {availableParts.map(p => (
                                <option key={p.Part_Number} value={p.Part_Number}>{p.Part_Name}</option>
                            ))}
                        </datalist>

                        {/* Messages */}
                        {errorMsg && (
                            <div className="alert alert-danger" style={{ marginTop: 16 }}>
                                {errorMsg}
                            </div>
                        )}
                        {successMsg && (
                            <div className="alert alert-success" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircle size={18} /> {successMsg}
                            </div>
                        )}

                        {/* Submit */}
                        <div style={{ marginTop: 24 }}>
                            <button
                                type="submit"
                                className="btn btn-primary btn-lg"
                                disabled={submitting || !badgeVerified}
                                style={{ width: '100%' }}
                            >
                                {submitting
                                    ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Processing…</>
                                    : <><PackageMinus size={18} /> Save</>
                                }
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Visual Search Modal */}
            {isVisualSearch && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: 24 }}>
                    <div style={{ maxWidth: 500, width: '100%', margin: 'auto', background: 'var(--card-bg)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ScanText size={18} color="var(--accent)" /> Visual Scan
                            </div>
                            <button type="button" className="btn btn-ghost btn-icon" onClick={stopVisualSearch}><X size={20} /></button>
                        </div>
                        <div style={{ position: 'relative', width: '100%', background: '#000' }}>
                            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', maxHeight: 400, objectFit: 'cover' }} />
                            
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, border: '2px solid rgba(255,255,255,0.2)', pointerEvents: 'none' }}>
                                <div style={{ position: 'absolute', top: '20%', left: '20%', right: '20%', bottom: '20%', border: '1px dashed rgba(255,255,255,0.5)' }} />
                            </div>

                            {bestMatch && (
                                <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, background: 'rgba(0,0,0,0.8)', padding: '12px 16px', borderRadius: 8, color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Matching Part...</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                        <div style={{ fontWeight: 600, fontSize: 16 }}>{bestMatch.Part_Name}</div>
                                        <div style={{ fontSize: 14, color: bestMatch.score > 0.8 ? '#4ade80' : '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {Math.round(bestMatch.score * 100)}% Match
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        className="btn btn-primary" 
                                        style={{ width: '100%', marginTop: 12, background: '#4ade80', borderColor: '#4ade80', color: '#000', height: 40 }}
                                        onClick={() => selectPart(bestMatch.Part_Number)}
                                    >
                                        <CheckCircle size={16} /> Select This Part
                                    </button>
                                </div>
                            )}
                        </div>
                        <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                            Point camera at the part labels or physical shape.
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Confirm Public Stock Out Modal */}
        {showConfirm && (
            <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}>
                <div className="modal" style={{ maxWidth: 420 }}>
                    <div className="modal-header">
                        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={18} color="var(--warning)" />
                            Confirm Stock Out
                        </div>
                        <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>✕</button>
                    </div>
                    <div style={{ padding: '20px 0', lineHeight: 1.6, fontSize: 15 }}>
                        <strong>{userName}</strong>, are you sure you want to withdraw <strong>{items.filter(i => i.Part_Number && i.Quantity > 0).length} item(s)</strong> from stock?
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={executeSubmit} disabled={submitting}>
                            {submitting ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Processing…</> : <><PackageMinus size={14} /> Confirm</>}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
    );
}
