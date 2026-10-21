import React, { useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FinanceProvider, useFinance } from './contexts/FinanceContext';
import { VaultProvider } from './contexts/VaultContext';
import { ChildCareProvider, useChildCare } from './contexts/ChildCareContext';

import { Header } from './components/common/Header';
import { BottomNav, TabType } from './components/navigation/BottomNav';
import { ChildCareBanner } from './components/navigation/ChildCareBanner';

import { OnboardingPage } from './pages/OnboardingPage';
import { HomePage } from './pages/HomePage';
import { PaymentsPage } from './pages/PaymentsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { SavingsPage } from './pages/SavingsPage';
import { BillsPage } from './pages/BillsPage';
import { VaultPage } from './pages/VaultPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { ChildCarePage } from './pages/ChildCarePage';
import { ProfilePage } from './pages/ProfilePage';
import { BudgetsPage } from './pages/BudgetsPage';

import { SendMoneyModal } from './components/payment/SendMoneyModal';
import { ReceiveQrModal } from './components/payment/ReceiveQrModal';
import { ScanQrModal } from './components/payment/ScanQrModal';
import { ReceiptModal } from './components/payment/ReceiptModal';
import { PINModal } from './components/security/PINModal';
import { BiometricPromptModal } from './components/security/BiometricPromptModal';
import { ChildCareBlockModal } from './components/security/ChildCareBlockModal';

import { Transaction } from './types';

const MainAppContent: React.FC = () => {
  const { isAuthenticated, verifyAppPin } = useAuth();
  const { t } = useLanguage();
  const { isChildCareActive, disableChildCare, isBlockedAlertVisible, dismissBlockedAlert } = useChildCare();

  const [activeTab, setActiveTab] = useState<TabType>('home');

  // Modals state
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Transaction | null>(null);

  // Security Auth Modals
  const [pinModalState, setPinModalState] = useState<{
    isOpen: boolean;
    title?: string;
    subtitle?: string;
    onVerified?: () => void;
  }>({ isOpen: false });

  const [biometricModalState, setBiometricModalState] = useState<{
    isOpen: boolean;
    reason?: string;
    onVerified?: () => void;
  }>({ isOpen: false });

  // Trigger PIN verification helper
  const handleRequestPin = (onVerified: () => void, title?: string, subtitle?: string) => {
    setPinModalState({
      isOpen: true,
      title: title || 'Enter Security PIN',
      subtitle: subtitle || 'Enter your 4-digit FinPocket App PIN to authorize',
      onVerified,
    });
  };

  // Exit Child Care
  const handleExitChildCare = () => {
    handleRequestPin(
      () => {
        disableChildCare('1234');
      },
      'Parent Authentication Required',
      'Enter Parent PIN to exit Child Care Mode'
    );
  };

  if (!isAuthenticated) {
    return <OnboardingPage onComplete={() => setActiveTab('home')} />;
  }

  return (
    <div className="mobile-shell">
      {/* Top Header */}
      <Header
        title={
          activeTab === 'home'
            ? 'FinPocket'
            : activeTab === 'payments'
            ? t.navPayments
            : activeTab === 'history'
            ? t.navTransactions
            : activeTab === 'savings'
            ? t.navSavings
            : activeTab === 'profile'
            ? t.navProfile
            : activeTab === 'bills'
            ? t.billsTitle
            : activeTab === 'vault'
            ? t.documentVaultTitle
            : activeTab === 'ai'
            ? 'FinPocket AI'
            : activeTab === 'budgets'
            ? 'Budgets & Limits'
            : t.childCareTitle
        }
        onOpenAssistant={() => setActiveTab('ai')}
      />

      {/* Child Care Alert Banner */}
      <ChildCareBanner onExitClick={handleExitChildCare} />

      {/* Active Screen Tab View */}
      {activeTab === 'home' && (
        <HomePage
          onNavigate={tab => setActiveTab(tab)}
          onSendMoney={() => setShowSendModal(true)}
          onReceiveQr={() => setShowReceiveModal(true)}
          onScanQr={() => setShowScanModal(true)}
        />
      )}

      {activeTab === 'payments' && (
        <PaymentsPage
          onSendMoney={() => setShowSendModal(true)}
          onReceiveQr={() => setShowReceiveModal(true)}
          onScanQr={() => setShowScanModal(true)}
        />
      )}

      {activeTab === 'history' && (
        <TransactionsPage
          onSelectTransaction={txn => setSelectedReceipt(txn)}
        />
      )}

      {activeTab === 'savings' && (
        <SavingsPage
          onRequestPin={cb => handleRequestPin(cb)}
        />
      )}

      {activeTab === 'bills' && <BillsPage />}

      {activeTab === 'vault' && (
        <VaultPage
          onRequestPin={cb => handleRequestPin(cb, 'Unlock Document Vault', 'Enter your PIN to decrypt and view document')}
        />
      )}

      {activeTab === 'ai' && <AIAssistantPage />}

      {activeTab === 'childcare' && (
        <ChildCarePage
          onRequestPin={cb => handleRequestPin(cb, 'Parent Security PIN', 'Enter PIN to modify child care mode')}
        />
      )}

      {activeTab === 'budgets' && (
        <BudgetsPage onNavigate={tab => setActiveTab(tab)} />
      )}

      {activeTab === 'profile' && (
        <ProfilePage
          onNavigate={tab => setActiveTab(tab)}
          onRequestPin={cb => handleRequestPin(cb)}
        />
      )}

      {/* Persistent Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onChangeTab={tab => setActiveTab(tab)}
        onQuickPay={() => setShowSendModal(true)}
      />

      {/* Send Money Modal */}
      <SendMoneyModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onRequestPin={cb => handleRequestPin(cb, 'Authorize Payment', 'Enter PIN to confirm UPI transfer')}
        onPaymentComplete={txn => setSelectedReceipt(txn)}
      />

      {/* Receive Money QR Modal */}
      <ReceiveQrModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
      />

      {/* Scan QR Modal */}
      <ScanQrModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        onQrScanned={(merchant, amt) => {
          setShowSendModal(true);
        }}
      />

      {/* Transaction Receipt Modal */}
      <ReceiptModal
        transaction={selectedReceipt}
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
      />

      {/* Global PIN Pad Modal */}
      <PINModal
        isOpen={pinModalState.isOpen}
        title={pinModalState.title}
        subtitle={pinModalState.subtitle}
        onSuccess={() => {
          setPinModalState({ isOpen: false });
          if (pinModalState.onVerified) pinModalState.onVerified();
        }}
        onCancel={() => setPinModalState({ isOpen: false })}
        validatePin={pin => verifyAppPin(pin)}
      />

      {/* Biometric Prompt Modal */}
      <BiometricPromptModal
        isOpen={biometricModalState.isOpen}
        reason={biometricModalState.reason}
        onSuccess={() => {
          setBiometricModalState({ isOpen: false });
          if (biometricModalState.onVerified) biometricModalState.onVerified();
        }}
        onFallbackPin={() => {
          const cb = biometricModalState.onVerified;
          setBiometricModalState({ isOpen: false });
          if (cb) handleRequestPin(cb);
        }}
        onCancel={() => setBiometricModalState({ isOpen: false })}
      />

      {/* Child Care Block Alert Modal */}
      <ChildCareBlockModal
        isOpen={isBlockedAlertVisible}
        onClose={dismissBlockedAlert}
        onParentUnlock={() => {
          dismissBlockedAlert();
          handleExitChildCare();
        }}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <UserScopedProviders />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
};

const UserScopedProviders: React.FC = () => {
  const { user } = useAuth();
  const accountKey = user?.userId || 'guest';
  return (
    <FinanceProvider key={`finance-${accountKey}`}>
      <VaultProvider key={`vault-${accountKey}`}>
        <ChildCareProvider key={`childcare-${accountKey}`}>
          <MainAppContent />
        </ChildCareProvider>
      </VaultProvider>
    </FinanceProvider>
  );
};

export default App;
