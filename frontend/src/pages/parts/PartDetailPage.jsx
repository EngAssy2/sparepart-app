import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import dayjs from 'dayjs';
import { Pencil, Package, FileText, ArrowUpRight, ArrowDownRight, Download, QrCode, X, ZoomIn } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

const TXN_CLASS = {
    'Stock In': 'badge-success',
    'Stock Out': 'badge-danger',
    'Register': 'badge-accent',
    'modify': 'badge-warning',
    'delete': 'badge-muted',
};

function InfoRow({ label, value }) {
    return (
        <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 140, flexShrink: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
            <div style={{ flex: 1, fontSize: 13.5 }}>{value || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
        </div>
    );
}

export default function PartDetailPage() {
    const { seiPartNumber } = useParams();
    const [part, setPart] = useState(null);
    const [txns, setTxns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showImageModal, setShowImageModal] = useState(false);
    const { isAdmin } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        Promise.all([
            client.get(`/parts/${seiPartNumber}`),
            client.get(`/transactions?partNumber=${seiPartNumber}&limit=20`),
        ])
            .then(([pRes, tRes]) => {
                setPart(pRes.data);
                const rows = tRes.data?.transactions || tRes.data || [];
                setTxns(rows);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [seiPartNumber]);

    // Close image lightbox on Escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && showImageModal) setShowImageModal(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showImageModal]);

    if (loading) return (
        <AppShell title="Part Detail">
            <div className="loading-center"><div className="spinner" /></div>
        </AppShell>
    );

    if (!part) return (
        <AppShell title="Part Detail">
            <div className="empty-state"><Package size={48} /><p>Part not found</p></div>
        </AppShell>
    );

    const isLow = (part.Quantity ?? 0) <= (part.Safety_Stock ?? 0);

    const downloadQRCode = () => {
        const canvas = document.getElementById('qr-code-canvas');
        if (canvas) {
            const pngUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
            let downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = `${part.SEI_Part_Number}-qrcode.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        }
    };

    return (
        <>
        <AppShell title={`Part — ${part.SEI_Part_Number}`}>
            <div className="page-header">
                <div>
                    <div className="page-title">{part.Part_Name}</div>
                    <div className="page-subtitle">{part.SEI_Part_Number} · {part.Part_Number}</div>
                </div>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => navigate(`/parts/${seiPartNumber}/edit`)}>
                        <Pencil size={14} /> Edit Part
                    </button>
                )}
            </div>

            <div className="grid grid-2 gap-6">
                {/* Left — details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="card">
                        <div className="card-title" style={{ marginBottom: 8 }}>Basic Information</div>
                        <InfoRow label="Category" value={part.Part_Category} />
                        <InfoRow label="Status" value={
                            <span className={`badge ${part.Part_Status === 'Active' ? 'badge-success' : 'badge-muted'}`}>{part.Part_Status}</span>
                        } />
                        <InfoRow label="Priority" value={
                            <span className={`badge ${part.Priority_Level === 'Critical' ? 'badge-danger' : part.Priority_Level === 'High' ? 'badge-warning' : 'badge-muted'}`}>{part.Priority_Level}</span>
                        } />
                        <InfoRow label="Criteria" value={part.Part_Criteria} />
                        <InfoRow label="Brand" value={part.Brand} />
                        <InfoRow label="Model" value={part.Model} />
                        <InfoRow label="Supplier" value={part.Supplier} />
                    </div>

                    <div className="card">
                        <div className="card-title" style={{ marginBottom: 8 }}>Location</div>
                        <InfoRow label="Section" value={part.Section} />
                        <InfoRow label="Location" value={part.Location} />
                        <InfoRow label="Remark" value={part.Item_Description} />
                    </div>
                </div>

                {/* Right — stock + image */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Stock info */}
                    <div className="grid grid-2 gap-4">
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: isLow ? 'var(--danger-bg)' : 'var(--success-bg)' }}>
                                {isLow ? <ArrowDownRight size={20} color="var(--danger)" /> : <ArrowUpRight size={20} color="var(--success)" />}
                            </div>
                            <div>
                                <div className="stat-label">Current Stock</div>
                                <div className="stat-value" style={{ color: isLow ? 'var(--danger)' : 'var(--success)' }}>{part.Quantity}</div>
                                <div className="stat-delta">{isLow ? '⚠ Below safety stock' : 'OK'}</div>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon" style={{ background: 'var(--warning-bg)' }}>
                                <Package size={20} color="var(--warning)" />
                            </div>
                            <div>
                                <div className="stat-label">Safety Stock</div>
                                <div className="stat-value">{part.Safety_Stock ?? '—'}</div>
                                <div className="stat-delta">Minimum level</div>
                            </div>
                        </div>
                    </div>

                    {/* Image */}
                    {part.SEI_Part_Number && (
                        <div className="card" style={{ textAlign: 'center' }}>
                            <div className="card-title" style={{ marginBottom: 12 }}>Part Image</div>
                            <div 
                                onClick={() => setShowImageModal(true)}
                                style={{ 
                                    cursor: 'zoom-in', 
                                    position: 'relative',
                                    display: 'inline-block',
                                    borderRadius: 8,
                                    overflow: 'hidden'
                                }}
                            >
                                <img
                                    src={`/api/files/images/${part.SEI_Part_Number}`}
                                    alt={part.Part_Name}
                                    style={{ maxHeight: 200, borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
                                />
                                <div style={{
                                    position: 'absolute',
                                    bottom: 8,
                                    right: 8,
                                    background: 'rgba(0,0,0,0.55)',
                                    borderRadius: 6,
                                    padding: '4px 8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: '#fff',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    opacity: 0.8,
                                    transition: 'opacity 0.2s'
                                }}>
                                    <ZoomIn size={12} /> Click to enlarge
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Datasheet */}
                    {part.SEI_Part_Number && (
                        <div className="card">
                            <div className="card-title" style={{ marginBottom: 12 }}>Datasheet</div>
                            <a
                                href={`/api/files/DataSheets/${part.SEI_Part_Number}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-secondary"
                                style={{ display: 'inline-flex' }}
                            >
                                <FileText size={14} /> Open Datasheet PDF
                            </a>
                        </div>
                    )}

                    {/* Dates */}
                    <div className="card">
                        <InfoRow label="Created On" value={part.Created_On ? dayjs(part.Created_On).format('MMM D, YYYY') : '—'} />
                        <InfoRow label="Last Changed" value={part.Last_Change ? dayjs(part.Last_Change).format('MMM D, YYYY HH:mm') : '—'} />
                    </div>

                    {/* QR Code */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div className="card-title" style={{ marginBottom: 12, width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <QrCode size={18} color="var(--accent)" /> QR Code
                        </div>
                        <div style={{ background: '#fff', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                            <QRCodeCanvas
                                id="qr-code-canvas"
                                value={part.Part_Number}
                                size={140}
                                level="H"
                            />
                        </div>
                        <button className="btn btn-secondary" onClick={downloadQRCode} style={{ width: '100%' }}>
                            <Download size={14} /> Download QR Code
                        </button>
                    </div>
                </div>
            </div>

            {/* Transaction history for this part */}
            <div className="card" style={{ marginTop: 24 }}>
                <div className="card-header">
                    <div className="card-title">Movement History</div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Last 20 transactions</span>
                </div>
                {txns.length === 0 ? (
                    <div className="empty-state" style={{ paddingBlock: 28 }}><p>No transactions recorded</p></div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Transaction ID</th>
                                    <th>Date</th>
                                    <th>WW</th>
                                    <th>Type</th>
                                    <th>Qty</th>
                                    <th>Machine</th>
                                    <th>User</th>
                                    <th>Remark</th>
                                </tr>
                            </thead>
                            <tbody>
                                {txns.map((t) => (
                                    <tr key={t.SEI_Transacion_ID}>
                                        <td className="td-mono">{t.SEI_Transacion_ID}</td>
                                        <td>{dayjs(t.Date_Transaction).format('MMM D, YYYY')}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>WW{t.Work_Week}</td>
                                        <td><span className={`badge ${TXN_CLASS[t.Transaction_Type] || 'badge-muted'}`}>{t.Transaction_Type}</span></td>
                                        <td style={{ fontWeight: 600 }}>{t.Quantity}</td>
                                        <td>{t.Machine_Name || '—'}</td>
                                        <td>{t.User_Name}</td>
                                        <td style={{ color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.Remark || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AppShell>

        {/* Image Lightbox Modal */}
        {showImageModal && (
            <div 
                onClick={() => setShowImageModal(false)}
                onKeyDown={(e) => e.key === 'Escape' && setShowImageModal(false)}
                style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                    cursor: 'zoom-out',
                    animation: 'fadeIn 0.2s ease'
                }}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); setShowImageModal(false); }}
                    style={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        background: 'rgba(255,255,255,0.15)',
                        border: 'none',
                        borderRadius: 8,
                        padding: 8,
                        cursor: 'pointer',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                >
                    <X size={24} />
                </button>
                <img
                    src={`/api/files/images/${part.SEI_Part_Number}`}
                    alt={part.Part_Name}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: '90vw',
                        height: '85vh',
                        objectFit: 'contain',
                        borderRadius: 12,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        cursor: 'default',
                        animation: 'scaleIn 0.25s ease'
                    }}
                />
                <div style={{
                    position: 'absolute',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'center'
                }}>
                    {part.Part_Name} — {part.SEI_Part_Number}
                </div>
            </div>
        )}

        <style>{`
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from { transform: scale(0.9); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        `}</style>
    </>
    );
}
