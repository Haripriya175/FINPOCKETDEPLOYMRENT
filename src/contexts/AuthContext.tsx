import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserSession } from '../types';
import { StorageService } from '../services/storage';
import { CryptoService } from '../services/crypto';
import { ApiService } from '../services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  sessions: UserSession[];
  isServerOnline: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  loginWithMeta: (accessToken?: string) => Promise<boolean>;
  loginWithGoogle: (idToken?: string) => Promise<boolean>;
  register: (name: string, email: string, phone: string, pass: string, pin: string) => Promise<boolean>;
  logout: () => void;
  logoutAllDevices: () => void;
  updateUser: (updates: Partial<User>) => void;
  verifyAppPin: (pin: string) => Promise<boolean>;
  setAppPin: (newPin: string) => Promise<void>;
  toggleBiometrics: (enabled: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  StorageService.initialize();

  const [user, setUserState] = useState<User | null>(() => StorageService.getToken() ? StorageService.getUser() : null);
  const [token, setToken] = useState<string | null>(() => StorageService.getToken());
  const [sessions, setSessionsState] = useState<UserSession[]>(() => StorageService.getSessions());
  const [isServerOnline, setIsServerOnline] = useState<boolean>(false);

  useEffect(() => {
    ApiService.checkServerHealth().then(status => setIsServerOnline(status));
  }, []);

  const login = async (email: string, pass: string): Promise<boolean> => {
    const res = await ApiService.login(email, pass);
    if (res.success) {
      const u = StorageService.getUser();
      setUserState(u);
      setToken(StorageService.getToken());
      return true;
    }
    return false;
  };

  const loginWithMeta = async (accessToken?: string): Promise<boolean> => {
    const res = await ApiService.metaLogin(accessToken);
    if (res.success) {
      const u = StorageService.getUser();
      setUserState(u);
      setToken(StorageService.getToken());
      return true;
    }
    return false;
  };

  const loginWithGoogle = async (idToken?: string): Promise<boolean> => {
    const res = await ApiService.googleLogin(idToken);
    if (res.success) {
      const u = StorageService.getUser();
      setUserState(u);
      setToken(StorageService.getToken());
      return true;
    }
    return false;
  };

  const register = async (name: string, email: string, phone: string, pass: string, pin: string): Promise<boolean> => {
    const result = await ApiService.registerAccount(name, email, phone, pass);
    if (!result.success || !result.user) return false;
    const pinHash = await CryptoService.hashPin(pin);
    const account = { ...result.user, pinHash, appPinEnabled: true };
    StorageService.setUser(account);
    setUserState(account);
    setToken(StorageService.getToken());
    return true;
  };

  const logout = () => {
    StorageService.clearAuth();
    setUserState(null);
    setToken(null);
  };

  const logoutAllDevices = () => {
    const current = sessions.filter(s => s.isCurrent);
    StorageService.setSessions(current);
    setSessionsState(current);
  };

  const updateUser = (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    StorageService.setUser(updated);
    setUserState(updated);
  };

  const verifyAppPin = async (pin: string): Promise<boolean> => {
    if (!user) return false;
    return CryptoService.verifyPin(pin, user.pinHash || '1234');
  };

  const setAppPin = async (newPin: string) => {
    if (!user) return;
    updateUser({ pinHash: newPin, appPinEnabled: true });
  };

  const toggleBiometrics = (enabled: boolean) => {
    updateUser({ biometricsEnabled: enabled });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!(user && token),
        sessions,
        isServerOnline,
        login,
        loginWithMeta,
        loginWithGoogle,
        register,
        logout,
        logoutAllDevices,
        updateUser,
        verifyAppPin,
        setAppPin,
        toggleBiometrics,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
