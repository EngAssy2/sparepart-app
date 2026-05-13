import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import client from '../../api/client';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { Search, Download, ClipboardList } from 'lucide-react';

const TXN_CLASS = {
    'Stock In': 'badge-success',
    'Stock Out': 'badge-danger',
    'Register': 'badge-accent',
    'modify': 'badge-warning',
    'delete': 'badge-muted',
};
const TXN_TYPES = ['', 'Stock In', 'Stock Out', 'Register', 'modify', 'delete'];

export default function TransactionHistoryPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [txns, setTxns] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    // Helper to get initial state from URL or sessionStorage
    const getInitial = (key, urlKey, defaultValue) => {
        const fromUrl = searchParams.get(urlKey);
        if (fromUrl !== null) return fromUrl;
        try {
            const saved = JSON.parse(sessionStorage.getItem('transaction_history_filters') || '{}');
            return saved[key] !== undefined ? saved[key] : defaultValue;
        } catch { return defaultValue; }
    };

    const [page, setPage] = useState(() => parseInt(getInitial('page', 'page', 1)));
    const limit = 25;

    // Filters
    const [search, setSearch] = useState(() => getInitial('search', 'q', ''));
    const [type, setType] = useState(() => getInitial('type', 'type', ''));
    const [dateFrom, setDateFrom] = useState(() => getInitial('dateFrom', 'dateFrom', ''));
    const [dateTo, setDateTo] = useState(() => getInitial('dateTo', 'dateTo', ''));
    const [ww, setWw] = useState(() => getInitial('ww', 'ww', ''));

    // Sync to sessionStorage and URL
    useEffect(() => {
        const filters = { search, type, dateFrom, dateTo, ww, page };
        sessionStorage.setItem('transaction_history_filters', JSON.stringify(filters));

        const params = {};
        if (search) params.q = search;
        if (type) params.type = type;
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (ww) params.ww = ww;
        if (page > 1) params.page = page;
        setSearchParams(params, { replace: true });
    }, [search, type, dateFrom, dateTo, ww, page]);

    const fetchTxns = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, limit, search, type, dateFrom, dateTo, ww };
            const res = await client.get('/transactions', { params });
            setTxns(res.data.transactions || res.data);
            setTotal(res.data.total || (res.data.transactions || res.data).length);
        } catch {
            setTxns([]);
        } finally {
            setLoading(false);
        }
    }, [page, search, type, dateFrom, dateTo, ww]);

    useEffect(() => { fetchTxns(); }, [fetchTxns]);

    const handleExport = async () => {
        try {
            setExporting(true);
            // Fetch everything that matches the current filters
            const params = { page: 1, limit: 100000, search, type, dateFrom, dateTo, ww };
            const res = await client.get('/transactions', { params });
            const rawData = res.data.transactions || res.data || [];

            if (rawData.length === 0) {
                alert('No transactions found to export.');
                return;
            }

            const formatted = rawData.map(t => ({
                'Transaction ID': t.SEI_Transacion_ID,
                'Date': dayjs(t.Date_Transaction).format('YYYY-MM-DD HH:mm:ss'),
                'Work Week': `WW${t.Work_Week}`,
                'Part Number': t.Part_Number,
                'Type': t.Transaction_Type,
                'Quantity': t.Quantity,
                'Machine Name': t.Machine_Name || '',
                'User Badge': t.User_Badge || '',
                'User Name': t.User_Name || '',
                'Remark': t.Remark || ''
            }));

            const ws = XLSX.utils.json_to_sheet(formatted);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Transactions");
            
            XLSX.writeFile(wb, `Transaction_History_${dayjs().format('YYYY-MM-DD')}.xlsx`);

        } catch (err) {
            console.error('Export failed', err);
            alert('Failed to export data.');
        } finally {
            setExporting(false);
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <AppShell title="Transaction History">
            <div className="page-header">
                <div>
                    <div className="page-title">Transaction History</div>
                    <div className="page-subtitle">{total.toLocaleString()} records</div>
                </div>
                <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
                    {exporting ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Download size={14} />}
                    Export Excel
                </button>
            </div>

            <div className="filter-bar">
                <div className="input-wrap" style={{ flex: 1, minWidth: 180 }}>
                    <Search size={14} className="input-icon" />
                    <input
                        className="input"
                        placeholder="Part number, user name…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <select className="select-ctrl" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                    {TXN_TYPES.map(t => <option key={t} value={t}>{t || 'All Types'}</option>)}
                </select>
                <div className="input-wrap">
                    <input
                        className="input"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                        title="From date"
                    />
                </div>
                <div className="input-wrap">
                    <input
                        className="input"
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                        title="To date"
                    />
                </div>
                <input
                    className="input"
                    placeholder="Work Week (e.g. 10)"
                    value={ww}
                    onChange={(e) => { setWw(e.target.value); setPage(1); }}
                    style={{ width: 140 }}
                />
            </div>

            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Transaction ID</th>
                            <th>Date</th>
                            <th>WW</th>
                            <th>Part Number</th>
                            <th>Type</th>
                            <th>Qty</th>
                            <th>Machine</th>
                            <th>User</th>
                            <th>Remark</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></td></tr>
                        ) : txns.length === 0 ? (
                            <tr><td colSpan={9}>
                                <div className="empty-state" style={{ padding: 40 }}>
                                    <ClipboardList size={40} />
                                    <p>No transactions found</p>
                                </div>
                            </td></tr>
                        ) : txns.map((t) => (
                            <tr key={t.SEI_Transacion_ID}>
                                <td className="td-mono">{t.SEI_Transacion_ID}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{dayjs(t.Date_Transaction).format('MMM D, YYYY HH:mm')}</td>
                                <td style={{ color: 'var(--text-muted)' }}>WW{t.Work_Week}</td>
                                <td className="td-mono">{t.Part_Number}</td>
                                <td><span className={`badge ${TXN_CLASS[t.Transaction_Type] || 'badge-muted'}`}>{t.Transaction_Type}</span></td>
                                <td style={{ fontWeight: 600 }}>{t.Quantity}</td>
                                <td>{t.Machine_Name || '—'}</td>
                                <td>{t.User_Name}</td>
                                <td style={{ color: 'var(--text-muted)', maxWidth: 300, whiteSpace: 'normal', wordBreak: 'break-word' }}>{t.Remark || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="pagination">
                    <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                    {Array.from({ length: Math.min(totalPages, 9) }, (_, i) => {
                        const pg = i + 1;
                        return <button key={pg} className={`page-btn${page === pg ? ' active' : ''}`} onClick={() => setPage(pg)}>{pg}</button>;
                    })}
                    <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                </div>
            )}
        </AppShell>
    );
}
