/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useReducer, useState, useCallback } from 'react';
import { ErrorDialog } from '@/components/ui/error-dialog';

interface AppState {
  paymentSources: {
    id: string;
    name: string;
    paymentContractAddress: string;
    smartContractAddress: string;
    network: string;
    paymentType: string;
    NetworkHandlerConfig: {
      rpcProviderApiKey: string;
    };
    adminWallets: {
      walletAddress: string;
    }[];
    collectionWallet: {
      walletAddress: string;
      note?: string;
    };
    purchasingWallets: {
      walletMnemonic: string;
      note?: string;
    }[];
    sellingWallets: {
      walletMnemonic: string;
      note?: string;
    }[];
  }[];
  contracts: {
    id: string;
    paymentContractAddress: string;
    network: string;
    paymentType: string;
  }[];
  wallets: {
    id: string;
    walletAddress: string;
    note?: string;
  }[];
  apiKey: string | null;
}

type AppAction =
  | { type: 'SET_PAYMENT_SOURCES'; payload: any[] }
  | { type: 'SET_CONTRACTS'; payload: any[] }
  | { type: 'SET_WALLETS'; payload: any[] }
  | { type: 'SET_API_KEY'; payload: string }


const initialAppState: AppState = {
  paymentSources: [],
  contracts: [],
  wallets: [],
  apiKey: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PAYMENT_SOURCES':
      return {
        ...state,
        paymentSources: action.payload
      };
    case 'SET_CONTRACTS':
      return {
        ...state,
        contracts: action.payload
      };
    case 'SET_WALLETS':
      return {
        ...state,
        wallets: action.payload
      };
    case 'SET_API_KEY':
      return {
        ...state,
        apiKey: action.payload
      };
    default:
      return state;
  }
}

export const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  showError: (error: { code?: number; message: string; details?: unknown }) => void;
} | undefined>(undefined);

export function AppProvider({ children, initialState }: { children: React.ReactNode; initialState: AppState }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [error, setError] = useState<{ code?: number; message: string; details?: unknown } | null>(null);

  const showError = useCallback((error: { code?: number; message: string; details?: unknown }) => {
    setError(error);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, showError }}>
      {children}
      <ErrorDialog 
        open={!!error} 
        onClose={() => setError(null)} 
        error={error || { message: '' }} 
      />
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('Put it in AppProvider');
  }
  return context;
}

export { initialAppState }; 