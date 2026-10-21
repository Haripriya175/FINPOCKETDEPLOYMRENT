/**
 * FinPocket — ReBIT & Account Aggregator Standard Interfaces & Contracts
 */

export interface ReBITConsentRequestDTO {
  ver: string; // "1.1.2" | "2.0"
  timestamp: string; // ISO 8601
  txnId: string;
  consentMode: 'VIEW' | 'STORE';
  fetchType: 'ONETIME' | 'PERIODIC';
  consentTypes: ('PROFILE' | 'SUMMARY' | 'TRANSACTIONS')[];
  fiTypes: string[];
  purpose: {
    code: string; // "101"
    refUri: string;
    text: string;
    category: {
      type: string;
    };
  };
  dataConsumer: {
    id: string;
  };
  customer: {
    id: string; // e.g., "user@aa" or phone
  };
  dataFilter: {
    type: string;
    operator: string;
    value: string;
  }[];
  dataLife: {
    unit: 'DAY' | 'MONTH' | 'YEAR';
    value: number;
  };
  frequency: {
    unit: 'DAY' | 'MONTH' | 'YEAR' | 'HOUR';
    value: number;
  };
  validFrom: string;
  validTo: string;
}

export interface ReBITConsentResponseDTO {
  ver: string;
  timestamp: string;
  txnId: string;
  consentHandle: string;
  status: 'PENDING' | 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';
  redirectUrl?: string;
}

export interface DiscoveredAccountDTO {
  fipId: string;
  fipName: string;
  accountRefNumber: string;
  accountType: 'SAVINGS' | 'CURRENT' | 'DEPOSIT';
  maskedAccNumber: string;
  linkRefNumber?: string;
}

export interface ReBITDataFetchResponseDTO {
  account: {
    fipId: string;
    fipName: string;
    accountRefNumber: string;
    maskedAccNumber: string;
    accountType: string;
    currency: string;
    summary: {
      currentBalance: number;
      availableBalance: number;
      asOf: string;
    };
    transactions: {
      txnId: string;
      reference?: string;
      amount: number;
      type: 'DEBIT' | 'CREDIT';
      mode?: string;
      timestamp: string;
      valueDate?: string;
      narration: string;
    }[];
  };
}

export interface AAWebhookPayload {
  eventId: string;
  eventType: 'CONSENT_STATUS_UPDATE' | 'DATA_READY' | 'CONSENT_REVOKED';
  timestamp: string;
  consentHandle: string;
  consentStatus: 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';
  fipId?: string;
  accounts?: DiscoveredAccountDTO[];
}
