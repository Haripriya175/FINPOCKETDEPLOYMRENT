import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Home, ArrowLeftRight, Clock, PiggyBank, User as UserIcon, Send, Receipt, Wallet, FolderLock, Sparkles, Baby } from 'lucide-react';

export type TabType = 'home' | 'payments' | 'history' | 'savings' | 'profile' | 'bills' | 'vault' | 'ai' | 'childcare' | 'budgets';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onQuickPay: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab, onQuickPay }) => {
  const { t } = useLanguage();

  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => onChangeTab('home')}
      >
        <Home size={20} />
        <span>{t.navHome}</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`}
        onClick={() => onChangeTab('payments')}
      >
        <ArrowLeftRight size={20} />
        <span>{t.navPayments}</span>
      </button>

      {/* Floating Center Pay Button */}
      <button className="nav-pay-btn" onClick={onQuickPay} aria-label="Send Money">
        <Send size={20} />
      </button>

      <button
        className={`nav-item ${activeTab === 'savings' ? 'active' : ''}`}
        onClick={() => onChangeTab('savings')}
      >
        <PiggyBank size={20} />
        <span>{t.navSavings}</span>
      </button>

      <button className={`nav-item desktop-nav ${activeTab === 'history' ? 'active' : ''}`} onClick={() => onChangeTab('history')}>
        <Clock size={20} /><span>{t.navTransactions}</span>
      </button>
      <button className={`nav-item desktop-nav ${activeTab === 'bills' ? 'active' : ''}`} onClick={() => onChangeTab('bills')}>
        <Receipt size={20} /><span>{t.billsTitle}</span>
      </button>
      <button className={`nav-item desktop-nav ${activeTab === 'budgets' ? 'active' : ''}`} onClick={() => onChangeTab('budgets')}>
        <Wallet size={20} /><span>Budgets</span>
      </button>
      <button className={`nav-item desktop-nav ${activeTab === 'vault' ? 'active' : ''}`} onClick={() => onChangeTab('vault')}>
        <FolderLock size={20} /><span>{t.documentVaultTitle}</span>
      </button>
      <button className={`nav-item desktop-nav ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => onChangeTab('ai')}>
        <Sparkles size={20} /><span>FinPocket AI</span>
      </button>
      <button className={`nav-item desktop-nav ${activeTab === 'childcare' ? 'active' : ''}`} onClick={() => onChangeTab('childcare')}>
        <Baby size={20} /><span>{t.childCareTitle}</span>
      </button>

      <button
        className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
        onClick={() => onChangeTab('profile')}
      >
        <UserIcon size={20} />
        <span>{t.navProfile}</span>
      </button>
    </nav>
  );
};
