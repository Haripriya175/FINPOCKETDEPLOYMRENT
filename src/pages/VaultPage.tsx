import React, { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  FileText,
  Shield,
  Lock,
  Unlock,
  PlusCircle,
  AlertTriangle,
  Eye,
  Trash2,
  Calendar,
  CheckCircle2,
  X,
  Upload,
} from 'lucide-react';
import { DocumentItem } from '../types';

interface VaultPageProps {
  onRequestPin: (onVerified: () => void) => void;
}

const docTypes = ['Aadhaar', 'PAN Card', 'Driving Licence', 'Passport', 'Voter ID', 'Salary Slip', 'ITC Document', 'Insurance', 'Education', 'Bank', 'Other'] as const;

export const VaultPage: React.FC<VaultPageProps> = ({ onRequestPin }) => {
  const { documents, expiringSoonDocuments, uploadDocument, deleteDocument } = useVault();
  const { t } = useLanguage();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<DocumentItem['documentType']>('Aadhaar');
  const [maskedNum, setMaskedNum] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  const handleUploadSubmit = () => {
    if (docName.trim()) {
      uploadDocument({
        name: docName,
        documentType: docType,
        maskedNumber: maskedNum || undefined,
        expiryDate: expiryDate || undefined,
        fileType: 'image/png',
        fileSize: 450000,
      });
      setDocName('');
      setMaskedNum('');
      setExpiryDate('');
      setShowUploadModal(false);
    }
  };

  const handleViewDocument = (doc: DocumentItem) => {
    // Authenticate with PIN before revealing sensitive document
    onRequestPin(() => {
      setPreviewDoc(doc);
    });
  };

  return (
    <div className="mobile-body animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {t.documentVaultTitle}
          </h2>
          <span className="badge badge-teal" style={{ marginTop: '4px' }}>
            <Shield size={10} />
            <span>{t.vaultEncryptedBadge}</span>
          </span>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="btn-primary"
          style={{ width: 'auto', padding: '8px 12px', fontSize: '12px' }}
        >
          <PlusCircle size={14} />
          <span>Upload</span>
        </button>
      </div>

      {/* Expiry Warning Notification Banner */}
      {expiringSoonDocuments.length > 0 && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertTriangle size={20} color="var(--warning)" />
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warning)' }}>
              Document Expiry Alert
            </span>
            <p style={{ fontSize: '11px', color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
              Your <strong>{expiringSoonDocuments[0].name}</strong> expires in ~6 months ({expiringSoonDocuments[0].expiryDate}). Renew on time to prevent travel/service disruption.
            </p>
          </div>
        </div>
      )}

      {/* Document List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {documents.map(doc => (
          <div
            key={doc.id}
            className="fp-card"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileText size={20} />
              </div>

              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {doc.name}
                </h4>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {doc.maskedNumber || doc.documentType} • {doc.expiryDate ? `Exp: ${doc.expiryDate}` : 'Permanent'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleViewDocument(doc)}
                style={{
                  background: 'rgba(20, 184, 166, 0.15)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px',
                  color: 'var(--primary-light)',
                  cursor: 'pointer',
                }}
                title="View Document"
              >
                <Eye size={16} />
              </button>

              <button
                onClick={() => deleteDocument(doc.id)}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                }}
                title="Delete Document"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up">
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 12px 0' }}>Upload to Secure Vault</h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Document Name</label>
              <input className="fp-input" placeholder="e.g. Aadhaar Card, Passport" value={docName} onChange={e => setDocName(e.target.value)} />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Document Type</label>
              <select className="fp-input" value={docType} onChange={e => setDocType(e.target.value as any)}>
                {docTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Masked Identification Number</label>
              <input className="fp-input" placeholder="e.g. XXXX-XXXX-4829" value={maskedNum} onChange={e => setMaskedNum(e.target.value)} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Expiry Date (if applicable)</label>
              <input type="date" className="fp-input" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setShowUploadModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleUploadSubmit} style={{ flex: 1 }}>
                <Upload size={14} />
                <span>Encrypt & Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document View Preview Modal */}
      {previewDoc && (
        <div className="modal-overlay animate-fade">
          <div className="modal-sheet animate-slide-up" style={{ textAlign: 'center' }}>
            <div className="sheet-handle" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {previewDoc.name}
              </h3>
              <button
                onClick={() => setPreviewDoc(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Document Digital Card Graphic */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                border: '1px solid rgba(20, 184, 166, 0.4)',
                borderRadius: '16px',
                padding: '24px 20px',
                color: '#ffffff',
                textAlign: 'left',
                marginBottom: '16px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-light)', letterSpacing: '1px' }}>
                  GOVERNMENT OF INDIA
                </span>
                <Shield size={20} color="var(--primary-light)" />
              </div>

              <div style={{ fontSize: '16px', fontWeight: 700, margin: '8px 0 4px 0' }}>
                {previewDoc.documentType}
              </div>

              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '2px', color: '#f8fafc', margin: '12px 0' }}>
                {previewDoc.maskedNumber || 'XXXX-XXXX-8829'}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: '10px' }}>
                <span>Issued To: Jithendra Sureddy</span>
                <span>{previewDoc.expiryDate ? `Valid Until: ${previewDoc.expiryDate}` : 'Permanent Document'}</span>
              </div>
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              🔒 Protected by 256-bit AES encryption & Biometric authentication
            </p>

            <button className="btn-primary" onClick={() => setPreviewDoc(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
