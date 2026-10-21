import React, { useState } from 'react';
import { useFinance } from '../../contexts/FinanceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  StatementService,
  StatementPeriod,
  StatementFormat,
} from '../../services/statementService';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Calendar,
  Building,
  ShieldCheck,
  X,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Printer,
  Sparkles,
} from 'lucide-react';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({ isOpen, onClose }) => {
  const { transactions, bankAccounts } = useFinance();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [format, setFormat] = useState<StatementFormat>('PDF_STATEMENT');
  const [period, setPeriod] = useState<StatementPeriod>('THIS_MONTH');
  const [accountId, setAccountId] = useState<string>('ALL');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real-time preview calculation
  const summary = StatementService.generateStatementSummary(transactions, bankAccounts, {
    period,
    accountId,
    customStartDate: customStart,
    customEndDate: customEnd,
  });

  const handleExport = async () => {
    if (!user) return;
    setIsExporting(true);
    setSuccessNotice(null);

    try {
      if (format === 'CSV_STATEMENT') {
        StatementService.exportCsv(summary, user);
        setSuccessNotice('Statement CSV successfully generated and downloaded!');
      } else if (format === 'PDF_STATEMENT') {
        StatementService.exportPdfStatement(summary, user);
        setSuccessNotice('Official PDF Statement preview opened for printing / PDF saving!');
      } else if (format === 'PDF_REPORT') {
        StatementService.exportPdfFinancialReport(summary, user);
        setSuccessNotice('Monthly Financial Health Report opened for printing / PDF saving!');
      }
    } catch (err: any) {
      alert('Failed to generate export: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
      setTimeout(() => {
        setSuccessNotice(null);
      }, 4000);
    }
  };

  return (
    <div className="modal-overlay animate-fade" style={{ zIndex: 1200 }}>
      <div
        className="modal-sheet animate-slide-up"
        style={{
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 20px',
        }}
      >
        <div className="sheet-handle" />

        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(20, 184, 166, 0.15)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Download Statement & Report
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Official bank statement & analytics export
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Success Alert Banner */}
        {successNotice && (
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid var(--success)',
              borderRadius: '12px',
              padding: '10px 14px',
              color: 'var(--success)',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successNotice}</span>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', marginBottom: '16px' }}>
          {/* Format Selector Pills */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              CHOOSE EXPORT FORMAT
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setFormat('PDF_STATEMENT')}
                style={{
                  background: format === 'PDF_STATEMENT' ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface)',
                  border: format === 'PDF_STATEMENT' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '10px 8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Printer size={18} style={{ color: format === 'PDF_STATEMENT' ? 'var(--primary)' : 'var(--text-secondary)', margin: '0 auto 4px' }} />
                <div style={{ fontSize: '11px', fontWeight: 700, color: format === 'PDF_STATEMENT' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  Bank PDF
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Official Ledger</div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('PDF_REPORT')}
                style={{
                  background: format === 'PDF_REPORT' ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-surface)',
                  border: format === 'PDF_REPORT' ? '2px solid #0ea5e9' : '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '10px 8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Sparkles size={18} style={{ color: format === 'PDF_REPORT' ? '#0ea5e9' : 'var(--text-secondary)', margin: '0 auto 4px' }} />
                <div style={{ fontSize: '11px', fontWeight: 700, color: format === 'PDF_REPORT' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  Health Report
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Insights & Score</div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('CSV_STATEMENT')}
                style={{
                  background: format === 'CSV_STATEMENT' ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-surface)',
                  border: format === 'CSV_STATEMENT' ? '2px solid #22c55e' : '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '10px 8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <FileSpreadsheet size={18} style={{ color: format === 'CSV_STATEMENT' ? '#22c55e' : 'var(--text-secondary)', margin: '0 auto 4px' }} />
                <div style={{ fontSize: '11px', fontWeight: 700, color: format === 'CSV_STATEMENT' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  CSV / Excel
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Spreadsheet data</div>
              </button>
            </div>
          </div>

          {/* Statement Period Selector */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              STATEMENT PERIOD
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '8px' }}>
              {[
                { id: 'THIS_MONTH', label: 'This Month' },
                { id: 'LAST_MONTH', label: 'Last Month' },
                { id: 'LAST_3_MONTHS', label: 'Last 3 Months' },
                { id: 'FINANCIAL_YEAR', label: 'Financial Year (FY)' },
                { id: 'ALL', label: 'All Transactions' },
                { id: 'CUSTOM', label: 'Custom Date Range' },
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id as StatementPeriod)}
                  style={{
                    background: period === p.id ? 'var(--bg-card-hover)' : 'var(--bg-surface)',
                    border: period === p.id ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    color: period === p.id ? 'var(--primary-light)' : 'var(--text-secondary)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {period === 'CUSTOM' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>From Date</span>
                  <input
                    type="date"
                    className="fp-input"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    style={{ fontSize: '12px', padding: '8px' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>To Date</span>
                  <input
                    type="date"
                    className="fp-input"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    style={{ fontSize: '12px', padding: '8px' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Connected Bank Account Filter */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              ACCOUNT SELECTION
            </label>

            <select
              className="fp-input"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              style={{ fontSize: '13px', padding: '10px 12px' }}
            >
              <option value="ALL">Consolidated Statement (All Connected Accounts)</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bankName} — {b.maskedAccountNumber} ({b.accountType})
                </option>
              ))}
            </select>
          </div>

          {/* Live Preview Summary Card */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                STATEMENT PREVIEW SUMMARY
              </div>
              <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>
                {summary.totalTransactions} transactions found
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
              <div style={{ background: 'var(--bg-card)', padding: '10px 6px', borderRadius: '10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>CREDITS (+)</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--success)' }}>
                  ₹{summary.totalIncome.toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px 6px', borderRadius: '10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>DEBITS (-)</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--danger)' }}>
                  ₹{summary.totalExpense.toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px 6px', borderRadius: '10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>NET FLOW</div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: summary.netCashflow >= 0 ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {summary.netCashflow >= 0 ? '+' : ''}₹{summary.netCashflow.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px dashed var(--border-color)',
                fontSize: '11px',
                color: 'var(--text-muted)',
              }}
            >
              <ShieldCheck size={14} color="var(--primary)" />
              <span>Compliant with RBI Account Aggregator (AA) Statement Formats</span>
            </div>
          </div>
        </div>

        {/* Modal Action CTA */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ flex: 1, padding: '12px' }}
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleExport}
            disabled={isExporting}
            style={{
              flex: 2,
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {format === 'CSV_STATEMENT' ? (
              <>
                <FileSpreadsheet size={16} />
                <span>{isExporting ? 'Generating CSV...' : 'Download CSV Statement'}</span>
              </>
            ) : format === 'PDF_STATEMENT' ? (
              <>
                <Printer size={16} />
                <span>{isExporting ? 'Preparing...' : 'Generate PDF Statement'}</span>
              </>
            ) : (
              <>
                <FileText size={16} />
                <span>{isExporting ? 'Preparing...' : 'Generate Financial Report'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
