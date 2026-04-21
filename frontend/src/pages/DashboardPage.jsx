import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import client from '../api/client';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
    Package, AlertTriangle, TrendingUp, Activity,
    ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react';
import dayjs from 'dayjs';

const TXN_COLORS = {
    'Stock In': '#22c55e',
    'Stock Out': '#ef4444',
    'Register': '#3b82f6',
    'modify': '#f59e0b',
    'delete': '#8b5cf6',
};
const TXN_CLASS = {
    'Stock In': 'badge-success',
    'Stock Out': 'badge-danger',
    'Register': 'badge-accent',
    'modify': 'badge-warning',
    'delete': 'badge-muted',
};

function StatCard({ icon, label, value, delta, color }) {
    return (
        <div className="stat-card">
            <div className="stat-icon" style={{ background: color || 'var(--accent-light)' }}>
                {icon}
            </div>
            <div>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value ?? '—'}</div>
                {delta && <div className="stat-delta">{delta}</div>}
            </div>
        </div>
    );
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
            {payload.map((p) => (
                <div key={p.dataKey} style={{ color: p.color, fontWeight: 600 }}>
                    {p.name}: {p.value}
                </div>
            ))}
        </div>
    );
};

export default function DashboardPage() {
    const [stats, setStats] = useState(null);
    const [lowStock, setLowStock] = useState([]);
    const [recentTxns, setRecentTxns] = useState([]);
    const [weeklyChart, setWeeklyChart] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            client.get('/reports/dashboard'),
            client.get('/reports/low-stock'),
            client.get('/transactions?limit=10'),
        ])
            .then(([statsRes, lowRes, txnRes]) => {
                setStats(statsRes.data);
                setLowStock(lowRes.data.slice(0, 8));
                const rows = txnRes.data?.transactions || txnRes.data || [];
                setRecentTxns(rows.slice(0, 10));
                // Build weekly bar from txn counts if stats has weeklyChart
                if (statsRes.data?.weeklyChart) {
                    setWeeklyChart(statsRes.data.weeklyChart);
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <AppShell title="Dashboard">
                <div className="loading-center"><div className="spinner" /></div>
            </AppShell>
        );
    }

    const stockByCategory = stats?.categoryBreakdown || [];

    return (
        <AppShell title="Dashboard">
            {/* Stat Cards */}
            <div className="grid grid-4 gap-4 mb-6">
                <StatCard
                    icon={<Package size={20} color="#3b82f6" />}
                    label="Total Parts"
                    value={stats?.totalParts?.toLocaleString()}
                    delta="Registered in system"
                    color="var(--accent-light)"
                />
                <StatCard
                    icon={<AlertTriangle size={20} color="#f59e0b" />}
                    label="Low Stock Alerts"
                    value={stats?.lowStockCount}
                    delta="Below safety level"
                    color="var(--warning-bg)"
                />
                <StatCard
                    icon={<ArrowUpRight size={20} color="#22c55e" />}
                    label="Transactions Today"
                    value={stats?.txnToday}
                    delta="Stock In + Stock Out"
                    color="var(--success-bg)"
                />
                <StatCard
                    icon={<Activity size={20} color="#06b6d4" />}
                    label="This Week"
                    value={stats?.txnThisWeek}
                    delta={`WW${stats?.currentWW ?? '–'}`}
                    color="var(--info-bg)"
                />
            </div>

            {/* Charts row */}
            <div className="grid grid-2 gap-4 mb-6">
                {/* Weekly transaction volume */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Transaction Volume</div>
                            <div className="card-subtitle">Last 14 days</div>
                        </div>
                        <TrendingUp size={16} color="var(--text-muted)" />
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={weeklyChart}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Line type="monotone" dataKey="count" name="Transactions" stroke="var(--accent)" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Category breakdown */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Stock by Category</div>
                            <div className="card-subtitle">Top categories by total qty</div>
                        </div>
                    </div>
                    {stockByCategory.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={stockByCategory} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={90} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="total" name="Total Qty" radius={[0, 4, 4, 0]}>
                                    {stockByCategory.map((_, i) => (
                                        <Cell key={i} fill={`hsl(${210 + i * 30}, 70%, ${55 + i * 5}%)`} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="empty-state"><p>No category data available</p></div>
                    )}
                </div>
            </div>

            {/* Low Stock Table + Recent Transactions */}
            <div className="grid grid-2 gap-4">
                {/* Low Stock Alerts */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Low Stock Alerts</div>
                            <div className="card-subtitle">Parts below safety level</div>
                        </div>
                        <AlertTriangle size={16} color="var(--warning)" />
                    </div>
                    {lowStock.length === 0 ? (
                        <div className="empty-state" style={{ paddingBlock: 28 }}>
                            <p>All parts are above safety level ✓</p>
                        </div>
                    ) : (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Part #</th>
                                        <th>Name</th>
                                        <th>Qty</th>
                                        <th>Safety</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lowStock.map((p) => (
                                        <tr key={p.SEI_Part_Number}>
                                            <td className="td-mono">{p.SEI_Part_Number}</td>
                                            <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.Part_Name}</td>
                                            <td><span className="badge badge-danger">{p.Quantity}</span></td>
                                            <td style={{ color: 'var(--text-muted)' }}>{p.Safety_Stock}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Recent Transactions */}
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">Recent Transactions</div>
                            <div className="card-subtitle">Latest 10 movements</div>
                        </div>
                        <Clock size={16} color="var(--text-muted)" />
                    </div>
                    {recentTxns.length === 0 ? (
                        <div className="empty-state" style={{ paddingBlock: 28 }}><p>No transactions yet</p></div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {recentTxns.map((t) => (
                                <div key={t.SEI_Transacion_ID} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: TXN_COLORS[t.Transaction_Type] || '#666', flexShrink: 0 }} />
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.Part_Number}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {t.User_Name} · {dayjs(t.Date_Transaction).format('MMM D, HH:mm')}
                                        </div>
                                    </div>
                                    <span className={`badge ${TXN_CLASS[t.Transaction_Type] || 'badge-muted'}`} style={{ fontSize: 11 }}>
                                        {t.Transaction_Type}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </AppShell>
    );
}
