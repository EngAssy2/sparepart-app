import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Package, MapPin, Tag, FileText, Image as ImageIcon, PackageSearch, Camera, ScanText, X, Check, SwitchCamera, ZoomIn } from 'lucide-react';

const API_BASE = '/api/public';

export default function PublicPartInfoPage() {
    const navigate = useNavigate();

    // Input state
    const [searchQuery, setSearchQuery] = useState('');
    const [availableParts, setAvailableParts] = useState([]);

    // Part details state
    const [partInfo, setPartInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [showDatasheet, setShowDatasheet] = useState(false);
    const [showImageModal, setShowImageModal] = useState(false);

    // Visual Search State
    const [isVisualSearch, setIsVisualSearch] = useState(false);
    const [visualAtlas, setVisualAtlas] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [bestMatch, setBestMatch] = useState(null);
    const videoRef = useRef(null);
    const scanTimerRef = useRef(null);
    const visualSvcRef = useRef(null);

    // Camera device switching
    const [videoDevices, setVideoDevices] = useState([]);
    const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);

    // Load datalist items (lightweight - keep on mount)
    useEffect(() => {
        fetch(`${API_BASE}/parts/lite`)
            .then(res => res.json())
            .then(data => setAvailableParts(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, []);

    // Close image lightbox on Escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && showImageModal) setShowImageModal(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showImageModal]);

    // Visual Search Logic
    const openCameraStream = async (deviceId) => {
        const constraints = deviceId
            ? { video: { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } } }
            : { video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } };
        return navigator.mediaDevices.getUserMedia(constraints);
    };

    const startVisualSearch = async () => {
        setIsVisualSearch(true);
        setErrorMsg('');
        try {
            // Lazy-load the heavy TensorFlow.js visual recognition module
            if (!visualSvcRef.current) {
                visualSvcRef.current = await import('../../services/visualRecognition');
            }
            const visualSvc = visualSvcRef.current;

            await visualSvc.loadModel();

            // Load visual atlas on demand
            if (visualAtlas.length === 0) {
                try {
                    const res = await fetch(`${API_BASE}/embeddings/atlas`);
                    if (res.ok) {
                        const data = await res.json();
                        setVisualAtlas(data);
                    }
                } catch (err) {
                    console.error('Failed to load visual atlas:', err);
                }
            }

            // Enumerate devices (permission may now be granted)
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cams = devices.filter(d => d.kind === 'videoinput');
            setVideoDevices(cams);

            const stream = await openCameraStream(cams.length > 0 ? cams[0].deviceId : null);
            setCurrentDeviceIndex(0);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsScanning(true);
            }
        } catch (err) {
            setErrorMsg('Camera access denied or error loading AI model.');
            setIsVisualSearch(false);
        }
    };

    const switchCamera = async () => {
        if (videoDevices.length < 2) return;
        const nextIndex = (currentDeviceIndex + 1) % videoDevices.length;
        try {
            // Stop current stream
            if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            }
            const stream = await openCameraStream(videoDevices[nextIndex].deviceId);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setCurrentDeviceIndex(nextIndex);
        } catch (err) {
            console.error('Failed to switch camera:', err);
        }
    };

    const stopVisualSearch = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        }
        setIsVisualSearch(false);
        setIsScanning(false);
        setBestMatch(null);
        if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };

    useEffect(() => {
        if (isScanning && isVisualSearch) {
            scanTimerRef.current = setInterval(async () => {
                if (videoRef.current && videoRef.current.readyState >= 2 && visualSvcRef.current) {
                    try {
                        const visualSvc = visualSvcRef.current;
                        const emb = await visualSvc.getEmbedding(videoRef.current);
                        const matches = visualSvc.findMatches(emb, visualAtlas, 1);
                        if (matches.length > 0) {
                            const match = matches[0];
                            setBestMatch(match);
                            // If very confident, pick it!
                            if (match.score > 0.92) {
                                selectPart(match.Part_Number);
                            }
                        }
                    } catch (e) {
                        console.error('Scan error:', e);
                    }
                }
            }, 600);
        } else {
            if (scanTimerRef.current) clearInterval(scanTimerRef.current);
        }
        return () => { if (scanTimerRef.current) clearInterval(scanTimerRef.current); };
    }, [isScanning, isVisualSearch, visualAtlas]);

    const selectPart = (partNum) => {
        setSearchQuery(partNum);
        stopVisualSearch();
        // Trigger handleSearch with query
        fetch(`${API_BASE}/parts/${encodeURIComponent(partNum)}`)
            .then(res => res.json())
            .then(data => setPartInfo(data))
            .catch(() => setErrorMsg('Failed to load part details.'));
    };

    // Perform lookup
    const handleSearch = async (e) => {
        e?.preventDefault();
        if (!searchQuery.trim()) return;

        setLoading(true);
        setErrorMsg('');
        setPartInfo(null);
        setShowDatasheet(false);

        try {
            const res = await fetch(`${API_BASE}/parts/${encodeURIComponent(searchQuery.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setPartInfo(data);
            } else {
                setErrorMsg('Part not found. Please verify the Part Number.');
            }
        } catch (err) {
            setErrorMsg('Network error. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="public-stockout-page" style={{ minHeight: '100vh', paddingBottom: 60 }}>
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
                            <PackageSearch size={28} />
                        </div>
                        <div>
                            <h1 className="public-stockout-title">Check Part Information</h1>
                            <p className="public-stockout-subtitle">Public directory to view part details, stock, and datasheets</p>
                        </div>
                    </div>
                </div>

                {/* Search Card */}
                <div className="card public-stockout-card" style={{ padding: 20 }}>
                    {!isVisualSearch ? (
                        <>
                            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <input
                                        className="input"
                                        list="public-parts-list"
                                        placeholder="Scan or type Part Number"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        autoFocus
                                        required
                                    />
                                    <datalist id="public-parts-list">
                                        {availableParts.map(p => (
                                            <option key={p.Part_Number} value={p.Part_Number}>{p.Part_Name}</option>
                                        ))}
                                    </datalist>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: 100 }}>
                                        {loading ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <><Search size={14} /> Search</>}
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={startVisualSearch} title="Identify via Camera">
                                        <Camera size={16} />
                                    </button>
                                </div>
                            </form>
                            
                            {errorMsg && (
                                <div className="alert alert-danger" style={{ marginTop: 16 }}>{errorMsg}</div>
                            )}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ScanText size={16} color="var(--accent)" /> Visual Identification Mode
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {videoDevices.length > 1 && (
                                        <button className="btn btn-ghost btn-icon" onClick={switchCamera} title="Switch Camera">
                                            <SwitchCamera size={18} />
                                        </button>
                                    )}
                                    <button className="btn btn-ghost btn-icon" onClick={stopVisualSearch}><X size={18} /></button>
                                </div>
                            </div>
                            
                            <div style={{ position: 'relative', width: '100%', maxWidth: 400, margin: '0 auto', background: '#000', borderRadius: 12, overflow: 'hidden', border: '2px solid var(--accent)' }}>
                                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block' }} />
                                
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, border: '2px solid rgba(255,255,255,0.2)', pointerEvents: 'none' }}>
                                    <div style={{ position: 'absolute', top: '20%', left: '20%', right: '20%', bottom: '20%', border: '1px dashed rgba(255,255,255,0.5)' }} />
                                </div>

                                {bestMatch && (
                                    <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, background: 'rgba(0,0,0,0.8)', padding: '8px 12px', borderRadius: 8, color: '#fff', textAlign: 'left', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Matching Part...</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                                            <div style={{ fontWeight: 600 }}>{bestMatch.Part_Name}</div>
                                            <div style={{ fontSize: 13, color: bestMatch.score > 0.8 ? '#4ade80' : '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                {Math.round(bestMatch.score * 100)}% Match
                                            </div>
                                        </div>
                                        <button 
                                            className="btn btn-primary" 
                                            style={{ width: '100%', marginTop: 8, background: '#4ade80', borderColor: '#4ade80', color: '#000', height: 32, fontSize: 12 }}
                                            onClick={() => selectPart(bestMatch.Part_Number)}
                                        >
                                            <Check size={14} /> Open This Part
                                        </button>
                                    </div>
                                )}
                            </div>
                            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                                Point camera at the part labels or physical shape.
                            </p>
                        </div>
                    )}
                </div>

                {/* Results Area */}
                {partInfo && (
                    <div className="grid grid-2 gap-6" style={{ marginTop: 24 }}>
                        {/* Details Card */}
                        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                                    {partInfo.Part_Name}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                    {partInfo.SEI_Part_Number} · {partInfo.Part_Number}
                                </div>
                            </div>
                            
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Package size={14} /> Available Stock
                                    </span>
                                    <span style={{ fontWeight: 600, fontSize: 16, color: partInfo.Quantity > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                        {partInfo.Quantity}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <MapPin size={14} /> Location
                                    </span>
                                    <span style={{ fontWeight: 500 }}>
                                        {partInfo.Location || '—'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Tag size={14} /> Section
                                    </span>
                                    <span style={{ fontWeight: 500 }}>
                                        {partInfo.Section || '—'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Tag size={14} /> Model
                                    </span>
                                    <span style={{ fontWeight: 500 }}>
                                        {partInfo.Model || '—'}
                                    </span>
                                </div>
                            </div>

                            {/* View Datasheet Button */}
                            {partInfo.SEI_Part_Number && (
                                <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary w-full"
                                        style={{ height: 44, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}
                                        onClick={() => setShowDatasheet(!showDatasheet)}
                                    >
                                        <FileText size={16} /> {showDatasheet ? 'Close Datasheet' : 'Open Datasheet (PDF)'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Image Card */}
                        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ImageIcon size={16} color="var(--primary)" /> Part Image
                            </div>
                            
                            {partInfo.SEI_Part_Number ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', borderRadius: 8, overflow: 'hidden' }}>
                                    <div 
                                        onClick={() => setShowImageModal(true)}
                                        style={{ 
                                            cursor: 'zoom-in', 
                                            position: 'relative',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '100%',
                                            height: '100%'
                                        }}
                                    >
                                        <img
                                            src={`/api/files/images/${partInfo.SEI_Part_Number}`}
                                            alt={partInfo.Part_Name}
                                            style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain', display: 'block' }}
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.parentNode.nextSibling.style.display = 'flex';
                                            }}
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
                                    <div style={{ display: 'none', flexDirection: 'column', alignItems: 'center', color: 'var(--text-muted)', padding: 32 }}>
                                        <ImageIcon size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                                        <p>Image not found</p>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', borderRadius: 8, color: 'var(--text-muted)' }}>
                                    <ImageIcon size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                                    <p>No image available</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Datasheet IFrame */}
                {partInfo && partInfo.SEI_Part_Number && showDatasheet && (
                    <div className="card" style={{ marginTop: 24, padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FileText size={16} color="var(--primary)" /> Part Datasheet
                            </div>
                            <a href={`/api/files/DataSheets/${partInfo.SEI_Part_Number}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                                Open in new tab
                            </a>
                        </div>
                        <iframe
                            src={`/api/files/DataSheets/${partInfo.SEI_Part_Number}`}
                            style={{ width: '100%', height: '800px', border: 'none', display: 'block' }}
                            title={`${partInfo.SEI_Part_Number} Datasheet`}
                        />
                    </div>
                )}
            </div>

            {/* Image Lightbox Modal */}
            {showImageModal && partInfo && (
                <div 
                    onClick={() => setShowImageModal(false)}
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
                        src={`/api/files/images/${partInfo.SEI_Part_Number}`}
                        alt={partInfo.Part_Name}
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
                        {partInfo.Part_Name} — {partInfo.SEI_Part_Number}
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
        </div>
    );
}
