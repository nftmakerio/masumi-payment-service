import 'dotenv/config';

export interface PaymentSource {
  id: string;
  network?: 'PREPROD' | 'MAINNET';
  paymentType?: string;
  rpcProviderApiKey?: string;
  paymentContractAddress?: string;
  smartContractAddress?: string;
  isSyncing?: boolean;
  AdminWallets: {
    walletAddress: string;
    note?: string;
  }[];
  FeeReceiverNetworkWallet?: {
    walletAddress: string;
    note?: string;
  };
  FeePermille?: number;
  CollectionWallet?: {
    walletAddress: string;
    note?: string;
  };
  PurchasingWallets?: {
    walletMnemonic: string;
    note?: string;
  }[];
  SellingWallets?: {
    walletMnemonic: string;
    note?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSourceResponse {
  status: 'success' | 'error';
  data?: {
    paymentSources: PaymentSource[];
  };
  message?: string;
}

export async function getPaymentSources(
  token: string,
  take: number = 10,
  cursorId?: string,
): Promise<PaymentSourceResponse> {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  try {
    const queryParams = new URLSearchParams({
      take: take.toString(),
      ...(cursorId && { cursorId }),
    }).toString();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/payment-source/?${queryParams}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          token: token,
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch payment sources');
    }

    return data;
  } catch (error) {
    console.error('Payment source check failed:', error);
    throw error;
  }
}
