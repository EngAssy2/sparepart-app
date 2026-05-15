import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import client from '../../api/client';
import { Upload, FileText, Image, Save, X, Camera, SwitchCamera, AlertTriangle } from 'lucide-react';
import config from '../../config.json';
import * as visualSvc from '../../services/visualRecognition';

const { Category, Criteria, ModelList, SectionList } = config;
// const CATEGORIES = ['Mechanical', 'Electrical', 'Electronic', 'Pneumatic', 'Hydraulic', 'Consumable', 'Other'];
// const STATUSES = ['Active', 'Inactive', 'Discontinued'];
// const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
// const CRITERIA = ['Consumable', 'Replenishable', 'Non-replenishable'];

const locationOptions = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));

const fieldConfig = [
    { key: 'Part_Number', label: 'Part Number', type: 'text', required: true },
    { key: 'Part_Name', label: 'Part Name', type: 'text', required: true },
    { key: 'Part_Category', label: 'Category', type: 'select', options: Category, required: true },
    { key: 'Part_Criteria', label: 'Criteria', type: 'select', options: Criteria, required: true },
    { key: 'Model', label: 'Model', type: 'select', options: ModelList, required: true },
    { key: 'Section', label: 'Section', type: 'select', options: SectionList, required: true },
    { key: 'Brand', label: 'Brand', type: 'text', required: true },
    { key: 'Supplier', label: 'Supplier', type: 'text', required: true },
    { key: 'Location', label: 'Location', type: 'custom_location', required: true },
    { key: 'Quantity_Use_Each_Machine', label: 'Qty Use Each Machine', type: 'number', required: true },
    { key: 'Total_Machine', label: 'Total Machine', type: 'number', required: true },
    { key: 'Quantity', label: 'Current Quantity', type: 'number', required: true },
    { key: 'Remark', label: 'Remark', type: 'textarea' },
];

export default function PartFormPage() {
    const { seiPartNumber } = useParams(); // defined if editing
    const isEdit = !!seiPartNumber;
    const navigate = useNavigate();

    const [form, setForm] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [dupError, setDupError] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [imageLoadError, setImageLoadError] = useState(false);

    useEffect(() => {
        setImageLoadError(false);
    }, [imagePreview]);
    const [includeImage, setIncludeImage] = useState(!isEdit);
    const [visualEmbedding, setVisualEmbedding] = useState(null);
    
    const [datasheetFile, setDatasheetFile] = useState(null);
    const [includeDatasheet, setIncludeDatasheet] = useState(!isEdit);

    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = useRef(null);

    // Camera device switching
    const [videoDevices, setVideoDevices] = useState([]);
    const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);

    useEffect(() => {
        navigator.mediaDevices?.enumerateDevices().then(devices => {
            const cams = devices.filter(d => d.kind === 'videoinput');
            setVideoDevices(cams);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const openCameraStream = async (deviceId) => {
        const constraints = deviceId
            ? { video: { deviceId: { exact: deviceId } } }
            : { video: { facingMode: 'environment' } };
        return navigator.mediaDevices.getUserMedia(constraints);
    };

    const startCamera = async () => {
        try {
            // Re-enumerate devices (permission may now be granted)
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cams = devices.filter(d => d.kind === 'videoinput');
            setVideoDevices(cams);

            const stream = await openCameraStream(cams.length > 0 ? cams[0].deviceId : null);
            setCurrentDeviceIndex(0);
            setIsCameraOpen(true);
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play();
                }
            }, 100);
        } catch (err) {
            alert('Camera not available or access denied.');
            console.error(err);
        }
    };

    const switchCamera = async () => {
        if (videoDevices.length < 2) return;
        const nextIndex = (currentDeviceIndex + 1) % videoDevices.length;
        try {
            if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            }
            const stream = await openCameraStream(videoDevices[nextIndex].deviceId);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setCurrentDeviceIndex(nextIndex);
        } catch (err) {
            console.error('Failed to switch camera:', err);
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }
        setIsCameraOpen(false);
    };

    const capturePhoto = () => {
        if (videoRef.current) {
            const maxDim = 800;
            const vw = videoRef.current.videoWidth;
            const vh = videoRef.current.videoHeight;
            const scale = Math.min(1, maxDim / vw, maxDim / vh);
            const targetWidth = Math.round(vw * scale);
            const targetHeight = Math.round(vh * scale);

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight);
            
            canvas.toBlob(async (blob) => {
                const file = new File([blob], 'captured-photo.jpg', { type: 'image/jpeg' });
                setImageFile(file);
                const url = URL.createObjectURL(file);
                setImagePreview(url);
                stopCamera();
                
                // Generate Visual Fingerprint safely from a static image
                try {
                    const img = document.createElement('img');
                    img.src = url;
                    img.onload = async () => {
                        try {
                            const emb = await visualSvc.getEmbedding(img);
                            setVisualEmbedding(JSON.stringify(emb));
                        } catch (e) {
                            console.error('Failed to generate visual fingerprint:', e);
                        }
                    };
                } catch (e) {
                    console.error('Error initiating visual fingerprint:', e);
                }
            }, 'image/jpeg', 0.9);
        }
    };

    useEffect(() => {
        if (isEdit) {
            setLoading(true);
            client.get(`/parts/${seiPartNumber}`)
                .then((res) => {
                    setForm(res.data);
                    setImagePreview(`/api/files/images/${seiPartNumber}?t=${Date.now()}`);
                })
                .catch(() => setError('Failed to load part data.'))
                .finally(() => setLoading(false));
        }
    }, [seiPartNumber, isEdit]);

    const handleChange = (key, value) => {
        setForm((f) => ({ ...f, [key]: value }));
        if (key === 'Part_Number' && dupError) setDupError('');
    };

    // Trim whitespace/newlines on blur for text fields
    const handleTextBlur = (key) => {
        setForm((f) => ({ ...f, [key]: typeof f[key] === 'string' ? f[key].trim() : f[key] }));
    };

    const handlePartNumberBlur = async () => {
        // Trim first
        setForm((f) => ({ ...f, Part_Number: typeof f.Part_Number === 'string' ? f.Part_Number.trim() : f.Part_Number }));
        if (!form.Part_Number?.trim()) return;
        try {
            const url = isEdit 
                ? `/parts/check/duplicate?partNumber=${encodeURIComponent(form.Part_Number)}&excludeId=${seiPartNumber}`
                : `/parts/check/duplicate?partNumber=${encodeURIComponent(form.Part_Number)}`;
            const res = await client.get(url);
            if (res.data.isDuplicate) {
                setDupError('Part Number already exists!');
            }
        } catch (err) {
            // Ignore error gracefully
        }
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImageFile(file);
        const url = URL.createObjectURL(file);
        setImagePreview(url);

        // Generate Visual Fingerprint
        try {
            const img = document.createElement('img');
            img.src = url;
            img.onload = async () => {
                const emb = await visualSvc.getEmbedding(img);
                setVisualEmbedding(JSON.stringify(emb));
            };
        } catch (e) {
            console.error('Failed to generate visual fingerprint:', e);
        }
    };

    const uploadFile = async (file, type, targetSeiPartNumber) => {
        const fd = new FormData();
        if (targetSeiPartNumber) {
            fd.append('SEI_Part_Number', targetSeiPartNumber);
        }
        fd.append('type', type);
        fd.append('file', file);
        const res = await client.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        return res.data.filename;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (dupError) return;
        setError('');

        if (!isEdit) {
            if (!imageFile) {
                setError('Part image is required for new registrations.');
                return;
            }
            if (!datasheetFile) {
                setError('Datasheet (PDF) is required for new registrations.');
                return;
            }
        }
        setShowConfirm(true);
    };

    // Helper: trim all string fields in a form object
    const trimFormStrings = (obj) => {
        const cleaned = {};
        for (const [k, v] of Object.entries(obj)) {
            cleaned[k] = typeof v === 'string' ? v.trim() : v;
        }
        return cleaned;
    };

    const executeSubmit = async () => {
        setShowConfirm(false);
        setSaving(true);
        setError('');

        try {
            const cleanedForm = trimFormStrings(form);
            let imageFilename = cleanedForm.Image_Path || null;
            let datasheetFilename = cleanedForm.Datasheet_Path || null;
            let currentSeiPartNumber = seiPartNumber;

            if (!isEdit) {
                const initialPayload = {
                    ...cleanedForm,
                    Location: cleanedForm.Location,
                    Visual_Embedding: visualEmbedding
                };
                const res = await client.post('/parts', initialPayload);
                currentSeiPartNumber = res.data.SEI_Part_Number;
            }

            let filesUploaded = false;

            if (includeImage && imageFile) {
                imageFilename = await uploadFile(imageFile, 'image', currentSeiPartNumber);
                filesUploaded = true;
            } else if (!includeImage && !isEdit) {
                imageFilename = null;
            }

            if (includeDatasheet && datasheetFile) {
                datasheetFilename = await uploadFile(datasheetFile, 'datasheet', currentSeiPartNumber);
                filesUploaded = true;
            } else if (!includeDatasheet && !isEdit) {
                datasheetFilename = null;
            }

            if (isEdit) {
                const payload = {
                    ...cleanedForm,
                    Location: cleanedForm.Location,
                    Visual_Embedding: visualEmbedding
                };
                await client.put(`/parts/${currentSeiPartNumber}`, payload);
            }

            navigate(-1);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save part.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <AppShell title={isEdit ? 'Edit Part' : 'Register Part'}>
            <div className="loading-center"><div className="spinner" /></div>
        </AppShell>
    );

    return (
        <>
        <AppShell title={isEdit ? `Edit Part — ${seiPartNumber}` : 'Register New Part'}>
            <div className="page-header">
                <div>
                    <div className="page-title">{isEdit ? 'Modify Part' : 'Register New Part'}</div>
                    <div className="page-subtitle">{isEdit ? `Editing ${seiPartNumber}` : 'Add a new part to the inventory'}</div>
                </div>
                <button className="btn btn-secondary" onClick={() => navigate(-1)}>
                    <X size={14} /> Cancel
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-2 gap-6">
                    {/* Left col — fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {fieldConfig
                            .filter(f => !f.newOnly || !isEdit)
                            .map((f) => (
                                <div className="form-group" key={f.key}>
                                    <label className={`form-label${f.required ? ' required' : ''}`}>{f.label}</label>
                                    {f.type === 'custom_location' ? (() => {
                                        const currentLoc = form[f.key] || '';
                                        const parts = currentLoc.startsWith('Cabinet-') ? currentLoc.split('-') : ['', '', ''];
                                        const part1 = parts[1] || '';
                                        const part2 = parts[2] || '';
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Cabinet -</span>
                                                <select
                                                    className="select-ctrl"
                                                    value={part1}
                                                    onChange={(e) => handleChange(f.key, `Cabinet-${e.target.value}-${part2 || '00'}`)}
                                                    required={f.required}
                                                    style={{ width: 80, padding: '8px 12px' }}
                                                >
                                                    <option value="">—</option>
                                                    {locationOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                                <span style={{ color: 'var(--text-secondary)' }}>-</span>
                                                <select
                                                    className="select-ctrl"
                                                    value={part2}
                                                    onChange={(e) => handleChange(f.key, `Cabinet-${part1 || '00'}-${e.target.value}`)}
                                                    required={f.required}
                                                    style={{ width: 80, padding: '8px 12px' }}
                                                >
                                                    <option value="">—</option>
                                                    {locationOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                            </div>
                                        );
                                    })() : f.type === 'select' ? (
                                        <select
                                            className="select-ctrl"
                                            value={form[f.key] || ''}
                                            onChange={(e) => handleChange(f.key, e.target.value)}
                                            required={f.required}
                                        >
                                            <option value="">— Select —</option>
                                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    ) : f.type === 'textarea' ? (
                                        <textarea
                                            className="textarea-ctrl"
                                            value={form[f.key] || ''}
                                            onChange={(e) => handleChange(f.key, e.target.value)}
                                            placeholder={`Enter ${f.label.toLowerCase()}`}
                                        />
                                    ) : (
                                        <div>
                                            <input
                                                className={`input ${dupError && f.key === 'Part_Number' ? 'input-error' : ''}`}
                                                type={f.type}
                                                value={form[f.key] !== undefined ? form[f.key] : ''}
                                                onChange={(e) => handleChange(f.key, f.type === 'number' ? (e.target.value === '' ? '' : parseInt(e.target.value, 10)) : e.target.value)}
                                                onKeyDown={f.type === 'number' ? (e) => {
                                                    // Allow only digits and navigation keys
                                                    if (!/^[0-9]$/.test(e.key) && !['Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                                                        e.preventDefault();
                                                    }
                                                } : undefined}
                                                onPaste={f.type === 'number' ? (e) => {
                                                    const text = e.clipboardData.getData('text');
                                                    if (!/^\d+$/.test(text)) e.preventDefault();
                                                } : undefined}
                                                min={f.type === 'number' ? "0" : undefined}
                                                onBlur={f.key === 'Part_Number' ? handlePartNumberBlur : (f.type === 'text' ? () => handleTextBlur(f.key) : undefined)}
                                                placeholder={`Enter ${f.label.toLowerCase()}`}
                                                required={f.required}
                                                style={dupError && f.key === 'Part_Number' ? { borderColor: 'var(--danger)' } : {}}
                                            />
                                            {f.key === 'Part_Number' && dupError && (
                                                <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>
                                                    {dupError}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>

                    {/* Right col — uploads */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Image upload */}
                        <div className="card">
                            <div className="card-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Part Image {!isEdit && <span className="text-danger">*</span>}</span>
                                {isEdit && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 'normal', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={includeImage} 
                                            onChange={(e) => setIncludeImage(e.target.checked)} 
                                            style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                                        />
                                        Change Image
                                    </label>
                                )}
                            </div>
                            
                            <div style={{ opacity: includeImage ? 1 : 0.5, pointerEvents: includeImage ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                                {isCameraOpen ? (
                                    <div style={{ marginBottom: 12, textAlign: 'center', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
                                        <video ref={videoRef} style={{ width: '100%', maxHeight: 240, display: 'block', objectFit: 'cover' }} autoPlay playsInline muted />
                                        <div style={{ display: 'flex', gap: 10, padding: 8, justifyContent: 'center', background: 'var(--bg-elevated)' }}>
                                            <button type="button" className="btn btn-secondary" onClick={stopCamera} style={{ flex: 1 }}>Cancel</button>
                                            {videoDevices.length > 1 && (
                                                <button type="button" className="btn btn-secondary" onClick={switchCamera} title="Switch Camera" style={{ flex: 'none', width: 44, padding: 0 }}>
                                                    <SwitchCamera size={18} />
                                                </button>
                                            )}
                                            <button type="button" className="btn btn-primary" onClick={capturePhoto} style={{ flex: 1 }}>Capture</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {imagePreview && !imageLoadError ? (
                                            <div style={{ marginBottom: 12, textAlign: 'center' }}>
                                                <img 
                                                    src={imagePreview} 
                                                    alt="preview" 
                                                    style={{ maxHeight: 160, borderRadius: 8, border: '1px solid var(--border)' }} 
                                                    onError={() => setImageLoadError(true)}
                                                />
                                            </div>
                                        ) : null}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <label className="upload-zone" style={{ display: 'block', cursor: includeImage ? 'pointer' : 'default', padding: '20px 10px' }}>
                                                <Image size={24} style={{ margin: '0 auto' }} />
                                                <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-secondary)' }}>Upload File</p>
                                                <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} disabled={!includeImage} />
                                            </label>
                                            <div 
                                                className="upload-zone" 
                                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: includeImage ? 'pointer' : 'default', padding: '20px 10px' }}
                                                onClick={() => { if(includeImage) startCamera(); }}
                                            >
                                                <Camera size={24} style={{ margin: '0 auto' }} />
                                                <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text-secondary)' }}>Take Photo</p>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Datasheet upload */}
                        <div className="card">
                            <div className="card-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Datasheet (PDF) {!isEdit && <span className="text-danger">*</span>}</span>
                                {isEdit && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 'normal', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={includeDatasheet} 
                                            onChange={(e) => setIncludeDatasheet(e.target.checked)}
                                            style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                                        />
                                        Change Datasheet
                                    </label>
                                )}
                            </div>
                            
                            <div style={{ opacity: includeDatasheet ? 1 : 0.5, pointerEvents: includeDatasheet ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                                <label className="upload-zone" style={{ display: 'block', cursor: includeDatasheet ? 'pointer' : 'default' }}>
                                    <FileText size={28} style={{ margin: '0 auto' }} />
                                    <p>{datasheetFile ? datasheetFile.name : (form.Datasheet_Path || 'Click or drag a PDF here')}</p>
                                    <input type="file" accept=".pdf" onChange={(e) => setDatasheetFile(e.target.files[0])} style={{ display: 'none' }} disabled={!includeDatasheet} />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {error && <div className="alert alert-danger" style={{ marginTop: 20 }}>{error}</div>}

                <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? <><span className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Saving…</> : <><Save size={14} /> {isEdit ? 'Save Changes' : 'Register Part'}</>}
                    </button>
                </div>
            </form>
        </AppShell>

        {/* Confirm Save Modal */}
        {showConfirm && (
            <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}>
                <div className="modal" style={{ maxWidth: 420 }}>
                    <div className="modal-header">
                        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={18} color="var(--warning)" />
                            Confirm {isEdit ? 'Update' : 'Registration'}
                        </div>
                        <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>✕</button>
                    </div>
                    <div style={{ padding: '20px 0', lineHeight: 1.6, fontSize: 15 }}>
                        {isEdit
                            ? <>Are you sure you want to save changes to <strong>{seiPartNumber}</strong>?</>
                            : <>Are you sure you want to register <strong>{form.Part_Name || 'this part'}</strong> ({form.Part_Number})?</>
                        }
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={executeSubmit} disabled={saving}>
                            {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</> : <><Save size={14} /> Confirm</>}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
    );
}
