import { useState, useEffect, useRef, useCallback } from 'react';
import AppShell from '../../components/layout/AppShell';
import client from '../../api/client';
import dayjs from 'dayjs';
import {
    Download, BarChart3, AlertTriangle, TrendingUp, TrendingDown,
    ArrowUpRight, ArrowDownRight, Package, PackagePlus, PackageMinus,
    Users, FileText, FileCheck, Printer, FileDown, ChevronLeft, ChevronRight,
    Activity, ClipboardList, Minus, Scan, RefreshCw, AlertCircle, ShieldCheck
} from 'lucide-react';
import * as visualSvc from '../../services/visualRecognition';
import { useAuth } from '../../context/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, Legend, PieChart, Pie
} from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const TXN_CLASS = {
    'Stock In': 'badge-success',
    'Stock Out': 'badge-danger',
    'Register': 'badge-accent',
    'modify': 'badge-warning',
    'delete': 'badge-muted',
};

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', fontSize: 12, boxShadow: 'var(--shadow-md)'
        }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
            {payload.map(p => (
                <div key={p.dataKey} style={{ color: p.fill || p.color, fontWeight: 600 }}>
                    {p.name}: {p.value}
                </div>
            ))}
        </div>
    );
};

function DeltaBadge({ current, previous, suffix = '' }) {
    if (!previous || previous === 0) return <span className="report-delta neutral">—</span>;
    const pct = ((current - previous) / previous * 100).toFixed(1);
    const isUp = current > previous;
    const isDown = current < previous;
    return (
        <span className={`report-delta ${isUp ? 'up' : isDown ? 'down' : 'neutral'}`}>
            {isUp ? <ArrowUpRight size={12} /> : isDown ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {Math.abs(pct)}%{suffix}
        </span>
    );
}

function StatCard({ icon, label, value, previous, color, subtitle }) {
    return (
        <div className="stat-card">
            <div className="stat-icon" style={{ background: color || 'var(--accent-light)' }}>{icon}</div>
            <div style={{ flex: 1 }}>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value?.toLocaleString() ?? '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <DeltaBadge current={value} previous={previous} />
                    {subtitle && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subtitle}</span>}
                </div>
            </div>
        </div>
    );
}

export default function ReportsPage() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const reportRef = useRef(null);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const res = await client.get('/reports/monthly', { params: { month, year } });
            setData(res.data);
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [month, year]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const goToPrevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    const exportExcel = async () => {
        if (!data || !data.transactions) {
            alert('No data available to export.');
            return;
        }
        try {
            const wb = XLSX.utils.book_new();
            
            // Format Transactions
            const txnData = data.transactions.map(t => ({
                'Transaction ID': t.SEI_Transacion_ID,
                'Date': dayjs(t.Date_Transaction).format('YYYY-MM-DD HH:mm'),
                'Work Week': `WW${t.Work_Week}`,
                'Part Number': t.Part_Number,
                'Type': t.Transaction_Type,
                'Quantity': t.Quantity,
                'Machine': t.Machine_Name,
                'User': t.User_Name,
                'Badge': t.User_Badge,
                'Remark': t.Remark
            }));
            const wsTxn = XLSX.utils.json_to_sheet(txnData);
            if (txnData.length) {
                wsTxn['!cols'] = Object.keys(txnData[0]).map(k => ({ wch: 15 }));
            }
            XLSX.utils.book_append_sheet(wb, wsTxn, "Transactions");

            // Format Low Stock Parts
            if (data.lowStockParts && data.lowStockParts.length > 0) {
                const lowStockData = data.lowStockParts.map(p => ({
                    'SEI Part Number': p.SEI_Part_Number,
                    'Part Number': p.Part_Number,
                    'Name': p.Part_Name,
                    'Category': p.Part_Category,
                    'Quantity': p.Quantity,
                    'Safety Stock': p.Safety_Stock,
                    'Priority': p.Priority_Level,
                    'Location': p.Location,
                    'Supplier': p.Supplier
                }));
                const wsLowStock = XLSX.utils.json_to_sheet(lowStockData);
                if (lowStockData.length) {
                  wsLowStock['!cols'] = Object.keys(lowStockData[0]).map(k => ({ wch: 15 }));
                }
                XLSX.utils.book_append_sheet(wb, wsLowStock, "Low Stock Alerts");
            }

            XLSX.writeFile(wb, `Monthly_Report_${year}_${String(month).padStart(2, '0')}.xlsx`);
        } catch (err) { 
            alert('Excel export failed.'); 
            console.error(err);
        }
    };

    const exportPDF = async () => {
        if (!reportRef.current) return;
        setExporting(true);
        try {
            // Temporarily expand for capture
            const el = reportRef.current;
            const canvas = await html2canvas(el, {
                backgroundColor: '#0d0f14',
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: el.scrollWidth,
                windowHeight: el.scrollHeight,
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 8;
            const usableWidth = pageWidth - margin * 2;

            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = usableWidth / imgWidth;
            const totalHeight = imgHeight * ratio;

            let yOffset = 0;
            let pageNum = 0;

            while (yOffset < totalHeight) {
                if (pageNum > 0) pdf.addPage();
                const srcY = yOffset / ratio;
                const srcH = Math.min((pageHeight - margin * 2) / ratio, imgHeight - srcY);
                const destH = srcH * ratio;

                // Create a temporary canvas for this page slice
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = imgWidth;
                pageCanvas.height = srcH;
                const ctx = pageCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH);

                const pageImgData = pageCanvas.toDataURL('image/png');
                pdf.addImage(pageImgData, 'PNG', margin, margin, usableWidth, destH);

                yOffset += destH;
                pageNum++;
            }

            pdf.save(`Monthly_Report_${MONTH_NAMES[month - 1]}_${year}.pdf`);
        } catch (err) {
            console.error('PDF export error:', err);
            alert('PDF export failed.');
        } finally {
            setExporting(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // --- Visual Sync Logic ---
    const { isSuperUser } = useAuth();
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
    const [syncLog, setSyncLog] = useState('');
    const [forceResync, setForceResync] = useState(false);

    const syncVisuals = async () => {
        setShowConfirmModal(false);
        setSyncing(true);
        setSyncLog('Loading AI engine...');
        let successCount = 0;
        let failCount = 0;
        try {
            await visualSvc.loadModel();
            
            setSyncLog('Fetching parts...');
            const partsRes = await client.get('/parts', { params: { limit: 5000 } });
            const allParts = partsRes.data.data || [];
            const partsToSync = allParts.filter(p => 
                forceResync || !p.Visual_Embedding
            );
            
            setSyncProgress({ current: 0, total: partsToSync.length });
            if (partsToSync.length === 0) {
                setSyncLog('All parts already have fingerprints. Use "Re-sync all" to regenerate.');
                setSyncing(false);
                return;
            }
            setSyncLog(`Found ${partsToSync.length} parts to process.`);

            for (let i = 0; i < partsToSync.length; i++) {
                const p = partsToSync[i];
                setSyncProgress({ current: i + 1, total: partsToSync.length });
                setSyncLog(`Processing ${p.Part_Number || p.SEI_Part_Number} (${i + 1}/${partsToSync.length})...`);

                try {
                    // Create an image element to process using SEI_Part_Number-based URL
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = `/api/files/images/${p.SEI_Part_Number}`;
                    
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = () => reject(new Error('Image not found'));
                    });

                    const emb = await visualSvc.getEmbedding(img);
                    await client.put(`/parts/${p.SEI_Part_Number}`, {
                        Visual_Embedding: JSON.stringify(emb),
                        Remark: 'Auto-sync visual fingerprint'
                    });
                    successCount++;
                } catch (e) {
                    failCount++;
                    console.warn(`Skipped ${p.Part_Number || p.SEI_Part_Number}: ${e.message}`);
                }
            }
            setSyncLog(`Sync complete! ✓ ${successCount} synced${failCount > 0 ? `, ✗ ${failCount} skipped (no image)` : ''}.`);
            if (successCount > 0) setShowSuccessModal(true);
        } catch (err) {
            console.error(err);
            setSyncLog('Sync failed. See console.');
        } finally {
            setSyncing(false);
            setSyncProgress({ current: 0, total: 0 });
        }
    };

    if (loading) return (
        <AppShell title="Reports">
            <div className="loading-center"><div className="spinner" /></div>
        </AppShell>
    );

    const s = data?.summary || {};
    const ps = data?.prevSummary || {};
    const proc = data?.procurementSummary || {};

    // Procurement status colors
    const PROC_STATUS_CLASS = {
        'Pending': 'badge-warning', 'Approved': 'badge-success', 'PO Created': 'badge-accent',
        'Cancelled': 'badge-danger', 'Open': 'badge-info', 'Partially Delivered': 'badge-warning',
        'Closed': 'badge-muted', 'Verified': 'badge-success',
    };

    return (
        <AppShell title="Monthly Report">
            <div className="report-page" ref={reportRef} id="monthly-report">
                {/* ── Header ── */}
                <div className="page-header report-header-row">
                    <div>
                        <div className="page-title">Monthly Report</div>
                        <div className="page-subtitle">
                            Comprehensive inventory & procurement review
                        </div>
                    </div>
                    <div className="flex gap-3 report-actions no-print">
                        <button className="btn btn-secondary" onClick={exportExcel} title="Export to Excel">
                            <Download size={14} /> Excel
                        </button>
                        <button className="btn btn-secondary" onClick={exportPDF} disabled={exporting} title="Download PDF with charts">
                            <FileDown size={14} /> {exporting ? 'Generating…' : 'PDF'}
                        </button>
                        <button className="btn btn-secondary" onClick={handlePrint} title="Print Report">
                            <Printer size={14} /> Print
                        </button>
                    </div>
                </div>

                {/* ── Month Selector ── */}
                <div className="report-month-selector no-print">
                    <button className="btn btn-ghost btn-icon" onClick={goToPrevMonth}>
                        <ChevronLeft size={18} />
                    </button>
                    <div className="report-month-display">
                        <select
                            className="select-ctrl report-month-select"
                            value={month}
                            onChange={e => setMonth(parseInt(e.target.value))}
                        >
                            {MONTH_NAMES.map((name, i) => (
                                <option key={i} value={i + 1}>{name}</option>
                            ))}
                        </select>
                        <select
                            className="select-ctrl report-year-select"
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value))}
                        >
                            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={goToNextMonth}>
                        <ChevronRight size={18} />
                    </button>
                </div>

                {/* Print-only header */}
                <div className="print-only-header">
                    <h1>Monthly Report — {MONTH_NAMES[month - 1]} {year}</h1>
                    <p>Generated on {dayjs().format('MMMM D, YYYY HH:mm')}</p>
                </div>

                {/* ── Report Period Badge ── */}
                <div className="report-period-badge">
                    <Activity size={14} />
                    <span>{MONTH_NAMES[month - 1]} {year}</span>
                    <span className="report-period-sep">|</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                        {s.totalTxns || 0} transactions · {s.uniqueParts || 0} unique parts
                    </span>
                </div>

                {/* ── Summary KPI Cards ── */}
                <div className="grid grid-5 gap-4 mb-6 report-kpi-row">
                    <StatCard
                        icon={<ClipboardList size={20} color="var(--accent)" />}
                        label="Total Transactions"
                        value={s.totalTxns}
                        previous={ps.totalTxns}
                        color="var(--accent-light)"
                        subtitle="vs prev month"
                    />
                    <StatCard
                        icon={<PackagePlus size={20} color="var(--success)" />}
                        label="Stock In"
                        value={s.totalStockIn}
                        previous={ps.totalStockIn}
                        color="var(--success-bg)"
                        subtitle="total qty"
                    />
                    <StatCard
                        icon={<PackageMinus size={20} color="var(--danger)" />}
                        label="Stock Out"
                        value={s.totalStockOut}
                        previous={ps.totalStockOut}
                        color="var(--danger-bg)"
                        subtitle="total qty"
                    />
                    <StatCard
                        icon={s.netChange >= 0 ? <TrendingUp size={20} color="var(--success)" /> : <TrendingDown size={20} color="var(--danger)" />}
                        label="Net Change"
                        value={s.netChange}
                        previous={ps.netChange}
                        color={s.netChange >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)'}
                        subtitle="in − out"
                    />
                    <StatCard
                        icon={<Package size={20} color="var(--info)" />}
                        label="Unique Parts"
                        value={s.uniqueParts}
                        previous={ps.uniqueParts}
                        color="var(--info-bg)"
                        subtitle="moved"
                    />
                </div>

                {/* ── Charts Row ── */}
                <div className="grid grid-2 gap-4 mb-6">
                    {/* Daily transaction volume */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">Daily Transaction Volume</div>
                                <div className="card-subtitle">Number of transactions per day</div>
                            </div>
                            <BarChart3 size={16} color="var(--text-muted)" />
                        </div>
                        {(data?.dailyTrend?.length || 0) > 0 ? (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={data.dailyTrend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="count" name="Transactions" radius={[4, 4, 0, 0]}>
                                        {data.dailyTrend.map((_, i) => (
                                            <Cell key={i} fill={`hsl(215, 70%, ${55 + (i % 4) * 5}%)`} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="empty-state" style={{ padding: 40 }}>
                                <p>No transaction data for this month</p>
                            </div>
                        )}
                    </div>

                    {/* Stock In vs Out comparison */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">Stock In vs Stock Out</div>
                                <div className="card-subtitle">Daily quantity comparison</div>
                            </div>
                            <TrendingUp size={16} color="var(--text-muted)" />
                        </div>
                        {(data?.stockInOutDaily?.length || 0) > 0 ? (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={data.stockInOutDaily}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="stockIn" name="Stock In" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="stockOut" name="Stock Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="empty-state" style={{ padding: 40 }}>
                                <p>No data for this month</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Top Parts Tables ── */}
                <div className="report-section-header">
                    <div className="report-section-line" />
                    <span>Top Parts Analysis</span>
                    <div className="report-section-line" />
                </div>

                <div className="grid grid-2 gap-4 mb-6">
                    {/* Top Consumed */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">🔥 Top 10 Most Consumed</div>
                                <div className="card-subtitle">Highest Stock Out volume</div>
                            </div>
                        </div>
                        {(data?.topConsumed?.length || 0) > 0 ? (
                            <div className="table-wrap">
                                <table>
                                    <thead><tr>
                                        <th>#</th><th>Part Number</th><th>Name</th><th>Category</th><th>Total Qty</th><th>Txns</th>
                                    </tr></thead>
                                    <tbody>
                                        {data.topConsumed.map((p, i) => (
                                            <tr key={p.Part_Number}>
                                                <td style={{ fontWeight: 700, color: i < 3 ? 'var(--danger)' : 'var(--text-muted)' }}>{i + 1}</td>
                                                <td className="td-mono">{p.Part_Number}</td>
                                                <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.Part_Name}</td>
                                                <td><span className="badge badge-muted">{p.Part_Category}</span></td>
                                                <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{p.totalQty}</td>
                                                <td style={{ color: 'var(--text-muted)' }}>{p.txnCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: 24 }}><p>No stock out this month</p></div>
                        )}
                    </div>

                    {/* Top Restocked */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">📦 Top 10 Most Restocked</div>
                                <div className="card-subtitle">Highest Stock In volume</div>
                            </div>
                        </div>
                        {(data?.topRestocked?.length || 0) > 0 ? (
                            <div className="table-wrap">
                                <table>
                                    <thead><tr>
                                        <th>#</th><th>Part Number</th><th>Name</th><th>Category</th><th>Total Qty</th><th>Txns</th>
                                    </tr></thead>
                                    <tbody>
                                        {data.topRestocked.map((p, i) => (
                                            <tr key={p.Part_Number}>
                                                <td style={{ fontWeight: 700, color: i < 3 ? 'var(--success)' : 'var(--text-muted)' }}>{i + 1}</td>
                                                <td className="td-mono">{p.Part_Number}</td>
                                                <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.Part_Name}</td>
                                                <td><span className="badge badge-muted">{p.Part_Category}</span></td>
                                                <td style={{ fontWeight: 700, color: 'var(--success)' }}>{p.totalQty}</td>
                                                <td style={{ color: 'var(--text-muted)' }}>{p.txnCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: 24 }}><p>No stock in this month</p></div>
                        )}
                    </div>
                </div>

                {/* ── User Activity ── */}
                <div className="report-section-header">
                    <div className="report-section-line" />
                    <span>User Activity</span>
                    <div className="report-section-line" />
                </div>

                <div className="card mb-6">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Transactions by User</div>
                            <div className="card-subtitle">Who moved what this month</div>
                        </div>
                        <Users size={16} color="var(--text-muted)" />
                    </div>
                    {(data?.userActivity?.length || 0) > 0 ? (
                        <div className="table-wrap">
                            <table>
                                <thead><tr>
                                    <th>User</th><th>Badge</th><th>Transactions</th>
                                    <th>Stock In Qty</th><th>Stock Out Qty</th><th>Net</th>
                                </tr></thead>
                                <tbody>
                                    {data.userActivity.map(u => {
                                        const net = (u.totalIn || 0) - (u.totalOut || 0);
                                        return (
                                            <tr key={u.User_Badge}>
                                                <td style={{ fontWeight: 600 }}>{u.User_Name}</td>
                                                <td className="td-mono">{u.User_Badge}</td>
                                                <td><span className="badge badge-accent">{u.txnCount}</span></td>
                                                <td style={{ color: 'var(--success)' }}>{u.totalIn || 0}</td>
                                                <td style={{ color: 'var(--danger)' }}>{u.totalOut || 0}</td>
                                                <td style={{ fontWeight: 600, color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                    {net >= 0 ? '+' : ''}{net}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: 24 }}><p>No activity this month</p></div>
                    )}
                </div>

                {/* ── Procurement Summary ── */}
                <div className="report-section-header">
                    <div className="report-section-line" />
                    <span>Procurement Summary</span>
                    <div className="report-section-line" />
                </div>

                <div className="grid grid-2 gap-4 mb-6">
                    {/* PR Summary */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">Purchase Requests (PR)</div>
                                <div className="card-subtitle">{proc.prCount || 0} created this month</div>
                            </div>
                            <FileText size={16} color="var(--accent)" />
                        </div>
                        {(proc.prByStatus?.length || 0) > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                                {proc.prByStatus.map(s => (
                                    <div key={s.Status} className="report-proc-chip">
                                        <span className={`badge ${PROC_STATUS_CLASS[s.Status] || 'badge-muted'}`}>{s.Status}</span>
                                        <span className="report-proc-count">{s.count}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: 24 }}>
                                <p>No PRs this month</p>
                            </div>
                        )}
                    </div>

                    {/* PO Summary */}
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">Purchase Orders (PO)</div>
                                <div className="card-subtitle">{proc.poCount || 0} created this month</div>
                            </div>
                            <FileCheck size={16} color="var(--success)" />
                        </div>
                        {(proc.poByStatus?.length || 0) > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                                {proc.poByStatus.map(s => (
                                    <div key={s.Status} className="report-proc-chip">
                                        <span className={`badge ${PROC_STATUS_CLASS[s.Status] || 'badge-muted'}`}>{s.Status}</span>
                                        <span className="report-proc-count">{s.count}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: 24 }}>
                                <p>No POs this month</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Low Stock Alerts ── */}
                <div className="report-section-header">
                    <div className="report-section-line" />
                    <span>Low Stock Alerts</span>
                    <div className="report-section-line" />
                </div>

                <div className="card mb-6">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Parts Below Safety Stock</div>
                            <div className="card-subtitle">{data?.lowStockParts?.length || 0} parts require attention</div>
                        </div>
                        <AlertTriangle size={16} color="var(--warning)" />
                    </div>
                    {(data?.lowStockParts?.length || 0) === 0 ? (
                        <div className="empty-state" style={{ padding: 24 }}>
                            <p style={{ color: 'var(--success)' }}>✓ All parts are above safety stock level</p>
                        </div>
                    ) : (
                        <div className="table-wrap">
                            <table>
                                <thead><tr>
                                    <th>SEI Part #</th><th>Part Number</th><th>Name</th>
                                    <th>Category</th><th>Qty</th><th>Safety</th><th>Gap</th>
                                    <th>Priority</th><th>Supplier</th>
                                </tr></thead>
                                <tbody>
                                    {data.lowStockParts.map(p => {
                                        const gap = (p.Safety_Stock ?? 0) - (p.Quantity ?? 0);
                                        return (
                                            <tr key={p.SEI_Part_Number}>
                                                <td className="td-mono">{p.SEI_Part_Number}</td>
                                                <td className="td-mono">{p.Part_Number}</td>
                                                <td>{p.Part_Name}</td>
                                                <td><span className="badge badge-muted">{p.Part_Category || '—'}</span></td>
                                                <td><span className="badge badge-danger">{p.Quantity}</span></td>
                                                <td>{p.Safety_Stock}</td>
                                                <td style={{ color: 'var(--danger)', fontWeight: 600 }}>−{gap}</td>
                                                <td>
                                                    <span className={`badge ${p.Priority_Level === 'Critical' ? 'badge-danger' : p.Priority_Level === 'High' ? 'badge-warning' : 'badge-muted'}`}>
                                                        {p.Priority_Level || '—'}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--text-muted)' }}>{p.Supplier || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Full Transaction Detail ── */}
                <div className="report-section-header">
                    <div className="report-section-line" />
                    <span>Transaction Detail</span>
                    <div className="report-section-line" />
                </div>

                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">All Transactions — {MONTH_NAMES[month - 1]} {year}</div>
                            <div className="card-subtitle">{data?.transactions?.length || 0} records</div>
                        </div>
                        <ClipboardList size={16} color="var(--text-muted)" />
                    </div>
                    {(data?.transactions?.length || 0) > 0 ? (
                        <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                            <table>
                                <thead><tr>
                                    <th>Transaction ID</th><th>Date</th><th>WW</th>
                                    <th>Part Number</th><th>Type</th><th>Qty</th>
                                    <th>Machine</th><th>User</th><th>Remark</th>
                                </tr></thead>
                                <tbody>
                                    {data.transactions.map(t => (
                                        <tr key={t.SEI_Transacion_ID}>
                                            <td className="td-mono">{t.SEI_Transacion_ID}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{dayjs(t.Date_Transaction).format('MMM D, YYYY')}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>WW{t.Work_Week}</td>
                                            <td className="td-mono">{t.Part_Number}</td>
                                            <td><span className={`badge ${TXN_CLASS[t.Transaction_Type] || 'badge-muted'}`}>{t.Transaction_Type}</span></td>
                                            <td style={{ fontWeight: 600 }}>{t.Quantity}</td>
                                            <td>{t.Machine_Name || '—'}</td>
                                            <td>{t.User_Name}</td>
                                            <td style={{ color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.Remark || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: 40 }}>
                            <ClipboardList size={40} />
                            <p>No transactions for {MONTH_NAMES[month - 1]} {year}</p>
                        </div>
                    )}
                </div>

                {/* ── System Maintenance (Visual Sync) ── */}
                <div className="report-section-header no-print">
                    <div className="report-section-line" />
                    <span>System Maintenance</span>
                    <div className="report-section-line" />
                </div>

                <div className="card mb-6 no-print" style={{ border: '1px solid var(--accent-light)' }}>
                    <div className="card-header">
                        <div>
                            <div className="card-title">Local Visual Engine</div>
                            <div className="card-subtitle">Generate fingerprints for image-based part search</div>
                        </div>
                        <Scan size={16} color="var(--accent)" />
                    </div>
                    <div style={{ padding: '0 20px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                                <button 
                                    className="btn btn-primary" 
                                    onClick={() => setShowConfirmModal(true)} 
                                    disabled={syncing}
                                    style={{ background: 'var(--accent)', borderColor: 'var(--accent)' }}
                                >
                                {syncing ? <RefreshCw className="spinner" size={14} /> : <RefreshCw size={14} />}
                                {syncing ? 'Processing Architecture...' : 'Sync Visual Fingerprints'}
                            </button>
                            {isSuperUser && !syncing && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--warning)' }}>
                                    <input
                                        type="checkbox"
                                        checked={forceResync}
                                        onChange={e => setForceResync(e.target.checked)}
                                        style={{ accentColor: 'var(--warning)' }}
                                    />
                                    <ShieldCheck size={14} />
                                    Re-sync all (regenerate existing fingerprints)
                                </label>
                            )}
                            {syncing && (
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ fontSize: 13, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{syncLog}</span>
                                        <span>{syncProgress.current} / {syncProgress.total}</span>
                                    </div>
                                    <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div 
                                            style={{ 
                                                height: '100%', 
                                                background: 'var(--accent)', 
                                                width: `${(syncProgress.current / syncProgress.total) * 100}%`,
                                                transition: 'width 0.3s'
                                            }} 
                                        />
                                    </div>
                                </div>
                            )}
                            {!syncing && syncLog && (
                                <div style={{ fontSize: 13, color: syncLog.includes('✓') ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                                    {syncLog}
                                </div>
                            )}
                            {!syncing && !syncLog && (
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertCircle size={14} />
                                    Run this after bulk-importing or if visual search isn't finding existing parts.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setShowConfirmModal(false)}>
                    <div className="card modal-content" style={{ maxWidth: 400, textAlign: 'center', padding: '32px 24px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ 
                            width: 60, height: 60, background: 'var(--accent-light)', 
                            borderRadius: '50%', display: 'flex', alignItems: 'center', 
                            justifyContent: 'center', margin: '0 auto 20px', color: 'var(--accent)' 
                        }}>
                            <Scan size={32} />
                        </div>
                        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Start Visual Sync?</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 15, lineHeight: 1.5 }}>
                            This will process all part images in the system to enable camera-based search. This may take a moment depending on the number of parts.
                        </p>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowConfirmModal(false)}>Cancel</button>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={syncVisuals}>Yes, Sync Now</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setShowSuccessModal(false)}>
                    <div className="card modal-content" style={{ maxWidth: 400, textAlign: 'center', padding: '32px 24px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ 
                            width: 60, height: 60, background: 'var(--success-bg)', 
                            borderRadius: '50%', display: 'flex', alignItems: 'center', 
                            justifyContent: 'center', margin: '0 auto 20px', color: 'var(--success)' 
                        }}>
                            <FileCheck size={32} />
                        </div>
                        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Sync Complete!</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 15, lineHeight: 1.5 }}>
                            The visual fingerprints have been successfully generated and saved to the database. You can now use the Visual Search feature on the public page.
                        </p>
                        <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', height: 44, fontSize: 16 }}
                            onClick={() => setShowSuccessModal(false)}
                        >
                            Awesome!
                        </button>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
