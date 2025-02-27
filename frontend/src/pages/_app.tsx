/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppProvider, initialAppState } from "@/lib/contexts/AppContext";
import { useEffect, useState, useCallback } from "react";
import "@/styles/globals.css";
import "@/styles/styles.scss"
import type { AppProps } from "next/app";
import { useAppContext } from "@/lib/contexts/AppContext";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useRouter } from 'next/router';
import { ApiKeyDialog } from "@/components/ApiKeyDialog";
import { getHealth, getPaymentSource, getRpcApiKeys } from "@/lib/api/generated";

function InitializeApp() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const { state, dispatch } = useAppContext();
  const router = useRouter();
  const { apiClient } = useAppContext();
  const fetchPaymentSources = useCallback(async () => {
    try {
      const sourceResponse = await getPaymentSource({
        client: apiClient,
      });
      const { data } = sourceResponse;

      const sources = data?.data?.paymentSources || [];
      const sortedByCreatedAt = sources.sort((a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const reversed = [...sortedByCreatedAt]?.reverse();
      const sourcesMapped = reversed?.map((source: any, index: number) => ({
        ...source,
        index: index + 1
      }));
      const reversedBack = [...sourcesMapped]?.reverse();

      dispatch({ type: 'SET_PAYMENT_SOURCES', payload: reversedBack });
    } catch (error) {
      console.error('Failed to fetch payment sources:', error);
      toast.error('Error fetching payment sources. Please try again later.');
    }
  }, [apiClient, dispatch]);

  const fetchRpcApiKeys = useCallback(async () => {
    try {
      const response = await getRpcApiKeys({
        client: apiClient,
      });

      const rpcKeys = response.data?.rpcProviderKeys || [];
      dispatch({ type: 'SET_RPC_API_KEYS', payload: rpcKeys });
    } catch (error) {
      console.error('Failed to fetch RPC API keys:', error);
      toast.error('Error fetching RPC API keys. Please try again later.');
    }
  }, [apiClient, dispatch]);

  useEffect(() => {
    const init = async () => {
      try {
        await getHealth({ client: apiClient });

        const hexedKey = localStorage.getItem("payment_api_key");
        if (!hexedKey) {
          setIsHealthy(true);
          return;
        }

        const storedApiKey = Buffer.from(hexedKey, 'hex').toString('utf-8');
        apiClient.setConfig({
          headers: {
            'token': storedApiKey
          }
        });
        dispatch({ type: 'SET_API_KEY', payload: storedApiKey });
        setIsHealthy(true);

      } catch (error) {
        console.error('Health check failed:', error);
        setIsHealthy(false);
      }
    };

    init();
  }, [apiClient, dispatch]);

  useEffect(() => {
    if (isHealthy && router.pathname === '/' && state.apiKey) {
      fetchPaymentSources();
    } else if (isHealthy && state.apiKey && router.pathname?.includes("/contract/") && !state.paymentSources?.length) {
      fetchPaymentSources();
    }
  }, [router.pathname, isHealthy, fetchPaymentSources, state.apiKey, state.paymentSources?.length]);

  useEffect(() => {
    if (isHealthy && state.apiKey) {
      fetchRpcApiKeys();
    }
  }, [isHealthy, state.apiKey, fetchRpcApiKeys]);

  if (isHealthy === null) {
    return <div className="flex items-center justify-center bg-[#000] fixed top-0 left-0 w-full h-full z-50">
      <div className="text-center space-y-4">
        <div className="text-lg">Checking system status...</div>
        <div className="text-sm text-muted-foreground">Please wait...</div>
      </div>
    </div>;
  }

  if (isHealthy === false) {
    return <div className="flex items-center justify-center bg-[#000] fixed top-0 left-0 w-full h-full z-50">
      <div className="text-center space-y-4">
        <div className="text-lg text-destructive">System Unavailable</div>
        <div className="text-sm text-muted-foreground">
          Unable to connect to required services. Please try again later.
        </div>
      </div>
    </div>;
  }

  return null;
}

function ComponentHolder({ Component, pageProps, }: AppProps) {
  const { state } = useAppContext();
  return <div className="dark">
    {state.apiKey ? <Component {...pageProps} /> : <ApiKeyDialog />}
  </div>;
}

function AppContent({ Component, pageProps, router }: AppProps) {
  return (
    <AppProvider initialState={initialAppState}>
      <InitializeApp />
      <ComponentHolder Component={Component} pageProps={pageProps} router={router} />
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </AppProvider>
  );
}

export default AppContent;
