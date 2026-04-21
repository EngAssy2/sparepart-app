import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Plus, Pencil, Trash2, Users, Eye, EyeOff } from 'lucide-react';
import config from '../../config.json';

const { SectionList, JobLevelList } = config;

const LEVELS = { 1: 'Super User', 2: 'Admin', 3: 'Supervisor', 4: 'Technician' };
const LEVEL_CLASS = { 1: 'badge-danger', 2: 'badge-warning', 3: 'badge-accent', 4: 'badge-muted' };

const emptyUser = { User_Badge: '', User_name: '', User_Section: '', User_Level: '', Authority_Level: 4 };

export default function UsersPage() {
    const { isSuperUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null); // null | 'add' | 'edit'
    const [formUser, setFormUser] = useState(emptyUser);
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [confirmModal, setConfirmModal] = useState(null);
    const [resetModal, setResetModal] = useState(null);

    const fetchUsers = () => {
        setLoading(true);
        client.get('/users')
            .then((r) => setUsers(r.data))
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchUsers(); }, []);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setModal(null);
                setConfirmModal(null);
                setResetModal(null);
                setError('');
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const openAdd = () => { setFormUser(emptyUser); setError(''); setShowPassword(false); setModal('add'); };
    const openEdit = (u) => { setFormUser({ ...u }); setError(''); setShowPassword(false); setModal('edit'); };
    const closeModal = () => { setModal(null); setError(''); setShowPassword(false); };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            if (modal === 'add') {
                await client.post('/users', formUser);
            } else {
                await client.put(`/users/${formUser.User_Badge}`, formUser);
            }
            fetchUsers();
            closeModal();
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Failed to save user.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (badge) => {
        setConfirmModal(badge);
    };

    const executeDelete = async () => {
        if (!confirmModal) return;
        try {
            await client.delete(`/users/${confirmModal}`);
            fetchUsers();
            setConfirmModal(null);
        } catch (err) {
            setConfirmModal(null);
            alert(err.response?.data?.message || 'Delete failed');
        }
    };

    const executeResetPassword = async () => {
        if (!resetModal) return;
        setSaving(true);
        try {
            await client.put(`/users/${resetModal}`, { ...formUser, Password: 'user123' });
            fetchUsers();
            setResetModal(null);
            closeModal();
        } catch (err) {
            alert(err.response?.data?.message || err.response?.data?.error || 'Password reset failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AppShell title="User Management">
            <div className="page-header">
                <div>
                    <div className="page-title">User Management</div>
                    <div className="page-subtitle">{users.length} users registered</div>
                </div>
                {isSuperUser && (
                    <button className="btn btn-primary" onClick={openAdd}>
                        <Plus size={14} /> Add User
                    </button>
                )}
            </div>

            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Badge</th>
                            <th>Name</th>
                            <th>Section</th>
                            <th>Level</th>
                            <th>Authority</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></td></tr>
                        ) : users.map((u) => (
                            <tr key={u.User_Badge}>
                                <td className="td-mono">{u.User_Badge}</td>
                                <td style={{ fontWeight: 600 }}>{u.User_name}</td>
                                <td>{u.User_Section}</td>
                                <td>{u.User_Level}</td>
                                <td><span className={`badge ${LEVEL_CLASS[u.Authority_Level] || 'badge-muted'}`}>{LEVELS[u.Authority_Level] || u.Authority_Level}</span></td>
                                <td>
                                    <div className="flex gap-2">
                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(u)}><Pencil size={13} /></button>
                                        {isSuperUser && (
                                            <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleDelete(u.User_Badge)}><Trash2 size={13} /></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {modal && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="modal">
                        <div className="modal-header">
                            <div className="modal-title">{modal === 'add' ? 'Add New User' : 'Edit User'}</div>
                            <button className="btn btn-ghost btn-icon" onClick={closeModal}>✕</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {[
                                { key: 'User_Badge', label: 'Badge Number', required: true, type: 'text', disabled: modal === 'edit' || !isSuperUser },
                                { key: 'User_name', label: 'Full Name', required: true, type: 'text', disabled: !isSuperUser },
                                { key: 'User_Section', label: 'Section', type: 'select', options: SectionList, disabled: !isSuperUser },
                                { key: 'User_Level', label: 'Job Level', type: 'select', options: JobLevelList, disabled: !isSuperUser },
                            ].map((f) => (
                                <div className="form-group" key={f.key}>
                                    <label className={`form-label${f.required ? ' required' : ''}`}>{f.label}</label>
                                    {f.type === 'select' ? (
                                        <select
                                            className="select-ctrl"
                                            value={formUser[f.key] || ''}
                                            onChange={(e) => setFormUser(u => ({ ...u, [f.key]: e.target.value }))}
                                            disabled={f.disabled}
                                            required={f.required}
                                        >
                                            <option value="">— Select —</option>
                                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    ) : (
                                        <input
                                            className="input"
                                            value={formUser[f.key] || ''}
                                            onChange={(e) => setFormUser(u => ({ ...u, [f.key]: f.key === 'User_Badge' ? e.target.value.toUpperCase() : e.target.value }))}
                                            required={f.required}
                                            disabled={f.disabled}
                                            autoComplete="off"
                                        />
                                    )}
                                </div>
                            ))}

                            {modal === 'add' ? (
                                <div className="form-group">
                                    <label className="form-label">Password</label>
                                    <input
                                        className="input"
                                        value="user123 (Default)"
                                        disabled
                                    />
                                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                        New users are automatically assigned the default password.
                                    </div>
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label className="form-label">Password</label>
                                    {isSuperUser ? (
                                        <div>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => setResetModal(formUser.User_Badge)}
                                            >
                                                Reset to Default
                                            </button>
                                            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                                Instantly reset this user's password to 'user123'.
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                className="input"
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="Leave blank to keep current"
                                                value={formUser.Password || ''}
                                                onChange={(e) => setFormUser(u => ({ ...u, Password: e.target.value }))}
                                                minLength={6}
                                                style={{ paddingRight: 40, width: '100%' }}
                                                autoComplete="new-password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(v => !v)}
                                                style={{
                                                    position: 'absolute',
                                                    right: 10,
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-muted, #888)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: 0,
                                                }}
                                                tabIndex={-1}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label required">Authority Level</label>
                                <select
                                    className="select-ctrl"
                                    value={formUser.Authority_Level}
                                    onChange={(e) => setFormUser(u => ({ ...u, Authority_Level: Number(e.target.value) }))}
                                    disabled={!isSuperUser}
                                >
                                    {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                                </select>
                            </div>
                        </div>

                        {error && <div className="alert alert-danger" style={{ marginTop: 14 }}>{error}</div>}

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving…' : modal === 'add' ? 'Add User' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
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
                            Are you sure you want to delete user <strong>{confirmModal}</strong>? This cannot be undone.
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

            {/* Confirm Reset Password Modal */}
            {resetModal && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setResetModal(null); }}>
                    <div className="modal" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                Confirm Password Reset
                            </div>
                            <button className="btn btn-ghost" onClick={() => setResetModal(null)}>✕</button>
                        </div>
                        <div style={{ padding: '20px 0', lineHeight: 1.5, fontSize: 16 }}>
                            Are you sure you want to reset the password for user <strong>{resetModal}</strong> to the default (<code>user123</code>)?
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setResetModal(null)} disabled={saving}>Cancel</button>
                            <button className="btn btn-danger" onClick={executeResetPassword} disabled={saving}>
                                {saving ? 'Resetting...' : 'Reset Password'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
