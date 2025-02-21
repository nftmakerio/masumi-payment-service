import type { BaseTransactionQuery } from '@/types/api';

export interface Transaction {
  type: 'payment' | 'purchase';
  createdAt: string;
  updatedAt: string;
  status: string;
  txHash?: string;
  utxo?: string;
  errorType?: string;
  errorNote?: string;
  errorRequiresManualReview?: boolean;
  identifier: string;
  sellingWallet?: {
    walletAddress: string;
    note?: string;
  };
  collectionWallet: {
    walletAddress: string;
    note?: string;
  };
  buyerWallet?: {
    walletAddress: string;
    note?: string;
  };
  amounts: {
    amount: number;
    unit: string;
  }[];
  networkHandler: {
    network: string;
    paymentType: string;
  };
}

interface PaymentResponse {
  data: {
    payments: PaymentData[];
  }
}

interface PurchaseResponse {
  data: {
    purchases: PurchaseData[];
  }
}

interface BaseData {
  createdAt: string;
  updatedAt: string;
  status: string;
  txHash?: string;
  utxo?: string;
  errorType?: string;
  errorNote?: string;
  errorRequiresManualReview?: boolean;
  identifier: string;
  SmartContractWallet: {
    walletAddress: string;
    note?: string;
  };
  Amounts: {
    amount: number;
    unit: string;
  }[];
  NetworkHandler: {
    network: string;
    paymentType: string;
  };
}

interface PaymentData extends BaseData {
  BuyerWallet?: {
    walletVkey: string;
  };
}

interface PurchaseData extends BaseData {
  SellerWallet?: {
    walletVkey: string;
    note?: string;
  };
}

export async function getTransactions(token: string, params: BaseTransactionQuery = {}) {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  try {
    console.log(params.network);
    const paymentsResponse = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/payment/?${new URLSearchParams({
        limit: (params.limit || 10).toString(),
        ...(params.cursorIdentifier && { cursorIdentifier: params.cursorIdentifier }),
        ...(params.network && { network: params.network }),
        ...(params.contractAddress && { paymentContractAddress: params.contractAddress })
      })}`,
      {
        headers: {
          'accept': 'application/json',
          'token': token
        }
      }
    );

    const purchasesResponse = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/purchase/?${new URLSearchParams({
        limit: (params.limit || 10).toString(),
        ...(params.cursorIdentifier && { 
          cursorIdentifier: params.cursorIdentifier,
          cursorIdentifierSellingWalletVkey: params.cursorIdentifier 
        }),
        ...(params.network && { network: params.network }),
        ...(params.contractAddress && { paymentContractAddress: params.contractAddress })
      })}`,
      {
        headers: {
          'accept': 'application/json',
          'token': token
        }
      }
    );

    const [paymentsData, purchasesData] = await Promise.all([
      paymentsResponse.json() as Promise<PaymentResponse>,
      purchasesResponse.json() as Promise<PurchaseResponse>
    ]);

    const payments = paymentsData.data.payments.map((payment: PaymentData) => ({
      type: 'payment',
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      status: payment.status,
      txHash: payment.txHash,
      utxo: payment.utxo,
      errorType: payment.errorType,
      errorNote: payment.errorNote,
      errorRequiresManualReview: payment.errorRequiresManualReview,
      identifier: payment.identifier,
      buyerWallet: payment.BuyerWallet && {
        walletAddress: payment.BuyerWallet.walletVkey,
      },
      collectionWallet: {
        walletAddress: payment.SmartContractWallet.walletAddress,
        note: payment.SmartContractWallet.note
      },
      amounts: payment.Amounts,
      networkHandler: {
        network: params.network,
        paymentType: params.paymentType
      }
    }));

    const purchases = purchasesData.data.purchases.map((purchase: PurchaseData) => ({
      type: 'purchase',
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
      status: purchase.status,
      txHash: purchase.txHash,
      utxo: purchase.utxo,
      errorType: purchase.errorType,
      errorNote: purchase.errorNote,
      errorRequiresManualReview: purchase.errorRequiresManualReview,
      identifier: purchase.identifier,
      sellingWallet: purchase.SellerWallet && {
        walletAddress: purchase.SellerWallet.walletVkey,
        note: purchase.SellerWallet.note
      },
      collectionWallet: {
        walletAddress: purchase.SmartContractWallet.walletAddress,
        note: purchase.SmartContractWallet.note
      },
      amounts: purchase.Amounts,
      networkHandler: {
        network: params.network,
        paymentType: params.paymentType
      }
    }));

    const allTransactions = [...payments, ...purchases].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      status: 'success',
      data: allTransactions.slice(0, params.limit || 10)
    };
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
} 