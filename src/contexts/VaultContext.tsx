import React, { createContext, useContext, useState, useEffect } from 'react';
import { DocumentItem } from '../types';
import { StorageService } from '../services/storage';

interface VaultContextType {
  documents: DocumentItem[];
  expiringSoonDocuments: DocumentItem[];
  isVaultUnlocked: boolean;
  unlockVault: (pin: string) => boolean;
  lockVault: () => void;
  uploadDocument: (doc: Omit<DocumentItem, 'id' | 'userId' | 'uploadDate' | 'isEncrypted'>) => void;
  deleteDocument: (id: string) => void;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<DocumentItem[]>(() => StorageService.getDocuments());
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(true); // default unlocked for friendly demo

  const unlockVault = (pin: string) => {
    const user = StorageService.getUser();
    if (pin === (user.pinHash || '1234')) {
      setIsVaultUnlocked(true);
      return true;
    }
    return false;
  };

  const lockVault = () => {
    setIsVaultUnlocked(false);
  };

  const uploadDocument = (doc: Omit<DocumentItem, 'id' | 'userId' | 'uploadDate' | 'isEncrypted'>) => {
    const user = StorageService.getUser();
    const newDoc: DocumentItem = {
      ...doc,
      id: 'doc_' + Date.now(),
      userId: user.userId,
      uploadDate: new Date().toISOString(),
      isEncrypted: true,
    };
    const updated = [newDoc, ...documents];
    StorageService.setDocuments(updated);
    setDocuments(updated);
  };

  const deleteDocument = (id: string) => {
    const updated = documents.filter(d => d.id !== id);
    StorageService.setDocuments(updated);
    setDocuments(updated);
  };

  // Find documents expiring within 180 days (~6 months)
  const expiringSoonDocuments = documents.filter(d => {
    if (!d.expiryDate) return false;
    const expiry = new Date(d.expiryDate).getTime();
    const now = new Date().getTime();
    const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 185;
  });

  return (
    <VaultContext.Provider
      value={{
        documents,
        expiringSoonDocuments,
        isVaultUnlocked,
        unlockVault,
        lockVault,
        uploadDocument,
        deleteDocument,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within VaultProvider');
  return context;
};
