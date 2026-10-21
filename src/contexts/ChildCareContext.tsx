import React, { createContext, useContext, useState } from 'react';
import { ChildCareSettings } from '../types';
import { StorageService } from '../services/storage';

interface ChildCareContextType {
  settings: ChildCareSettings;
  isChildCareActive: boolean;
  enableChildCare: (parentPin: string) => boolean;
  disableChildCare: (parentPin: string) => boolean;
  updateChildCareSettings: (updates: Partial<ChildCareSettings>) => void;
  showPaymentBlockedAlert: () => void;
  isBlockedAlertVisible: boolean;
  dismissBlockedAlert: () => void;
}

const ChildCareContext = createContext<ChildCareContextType | undefined>(undefined);

export const ChildCareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ChildCareSettings>(() => StorageService.getChildCareSettings());
  const [isBlockedAlertVisible, setIsBlockedAlertVisible] = useState(false);

  const enableChildCare = (parentPin: string): boolean => {
    const user = StorageService.getUser();
    if (parentPin === (user.pinHash || '1234')) {
      const updated: ChildCareSettings = {
        ...settings,
        enabled: true,
        paymentBlocked: true,
        hideBalances: true,
        hideTransactionHistory: true,
        hideBankDetails: true,
        activatedAt: new Date().toISOString(),
      };
      StorageService.setChildCareSettings(updated);
      setSettings(updated);
      return true;
    }
    return false;
  };

  const disableChildCare = (parentPin: string): boolean => {
    const user = StorageService.getUser();
    if (parentPin === (user.pinHash || '1234') || parentPin === settings.parentPinHash) {
      const updated: ChildCareSettings = {
        ...settings,
        enabled: false,
      };
      StorageService.setChildCareSettings(updated);
      setSettings(updated);
      return true;
    }
    return false;
  };

  const updateChildCareSettings = (updates: Partial<ChildCareSettings>) => {
    const updated = { ...settings, ...updates };
    StorageService.setChildCareSettings(updated);
    setSettings(updated);
  };

  const showPaymentBlockedAlert = () => {
    setIsBlockedAlertVisible(true);
  };

  const dismissBlockedAlert = () => {
    setIsBlockedAlertVisible(false);
  };

  return (
    <ChildCareContext.Provider
      value={{
        settings,
        isChildCareActive: settings.enabled,
        enableChildCare,
        disableChildCare,
        updateChildCareSettings,
        showPaymentBlockedAlert,
        isBlockedAlertVisible,
        dismissBlockedAlert,
      }}
    >
      {children}
    </ChildCareContext.Provider>
  );
};

export const useChildCare = () => {
  const context = useContext(ChildCareContext);
  if (!context) throw new Error('useChildCare must be used within ChildCareProvider');
  return context;
};
