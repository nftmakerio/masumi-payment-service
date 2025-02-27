import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Copy } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAppContext } from "@/lib/contexts/AppContext";
import { getPayment, getPurchase } from "@/lib/api/generated";

type TransactionType = string;


type TransactionListProps = {
  contractAddress?: string;
  network: "Preprod" | "Mainnet";
  paymentType?: string;
  walletAddress?: string;
}

const MAX_ID_LENGTH = 32;
const MAX_HASH_LENGTH = 16;

const shortenText = (text: string, maxLength: number) => {
  if (!text || text.length <= maxLength) return text;
  const start = Math.ceil(maxLength / 2);
  const end = Math.floor(maxLength / 2);
  return `${text.substring(0, start)}...${text.substring(text.length - end)}`;
};

const formatStatus = (status: string) => {
  if (status === 'PaymentRequested') return 'Payment Requested';
  if (status === 'PurchaseRequested') return 'Purchase Requested';
  return status;
};

export function ContractTransactionList({ contractAddress, network, paymentType }: TransactionListProps) {
  const [transactions, setTransactions] = useState<{ id: string; createdAt: string; updatedAt: string; blockchainIdentifier: string; lastCheckedAt: string | null; submitResultTime: string; unlockTime: string; externalDisputeUnlockTime: string; requestedById: string; onChainState: "FundsLocked" | "FundsOrDatumInvalid" | "ResultSubmitted" | "RefundRequested" | "Disputed" | "Withdrawn" | "RefundWithdrawn" | "DisputedWithdrawn"; cooldownTime: number; cooldownTimeOtherParty: number; resultHash: string; NextAction: { requestedAction: "None" | "Ignore" | "WaitingForManualAction" | "WaitingForExternalAction" | "FundsLockingRequested" | "FundsLockingInitiated" | "SetRefundRequestedRequested" | "SetRefundRequestedInitiated" | "UnSetRefundRequestedRequested" | "UnSetRefundRequestedInitiated" | "WithdrawRefundRequested" | "WithdrawRefundInitiated"; errorType: "NetworkError" | "InsufficientFunds" | "Unknown"; errorNote: string | null; } | { requestedAction: "None" | "Ignore" | "WaitingForManualAction" | "WaitingForExternalAction" | "SubmitResultRequested" | "SubmitResultInitiated" | "WithdrawRequested" | "WithdrawInitiated" | "AuthorizeRefundRequested" | "AuthorizeRefundInitiated"; errorType: "NetworkError" | "Unknown"; errorNote: string | null; }; CurrentTransaction: { id: string; createdAt: string; updatedAt: string; txHash: string; status: "Pending" | "Confirmed" | "FailedViaTimeout"; } | { id: string; createdAt: string; updatedAt: string; txHash: string | null; } | null; TransactionHistory: { id: string; createdAt: string; updatedAt: string; txHash: string; status: "Pending" | "Confirmed" | "FailedViaTimeout"; }[] | { id: string; createdAt: string; updatedAt: string; txHash: string | null; }[] | null; Amounts: { id: string; createdAt: string; updatedAt: string; amount: string; unit: string; }[] | { id: string; createdAt: string; updatedAt: string; amount: string; unit: string; }[]; PaymentSource: { id: string; network: "Preprod" | "Mainnet"; smartContractAddress: string; paymentType: "Web3CardanoV1"; } | { id: string; network: "Preprod" | "Mainnet"; smartContractAddress: string; paymentType: "Web3CardanoV1"; }; SellerWallet?: { id: string; walletVkey: string; } | null; SmartContractWallet: { id: string; walletVkey: string; walletAddress: string; } | { id: string; walletVkey: string; walletAddress: string; } | null; metadata: string | null; type: string; BuyerWallet?: { id: string; walletVkey: string; } | null; }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursorIdentifier, setCursorIdentifier] = useState<string | null>(null);
  const [filter, setFilter] = useState<TransactionType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<{ id: string; createdAt: string; updatedAt: string; blockchainIdentifier: string; lastCheckedAt: string | null; submitResultTime: string; unlockTime: string; externalDisputeUnlockTime: string; requestedById: string; onChainState: "FundsLocked" | "FundsOrDatumInvalid" | "ResultSubmitted" | "RefundRequested" | "Disputed" | "Withdrawn" | "RefundWithdrawn" | "DisputedWithdrawn"; cooldownTime: number; cooldownTimeOtherParty: number; resultHash: string; NextAction: { requestedAction: "None" | "Ignore" | "WaitingForManualAction" | "WaitingForExternalAction" | "FundsLockingRequested" | "FundsLockingInitiated" | "SetRefundRequestedRequested" | "SetRefundRequestedInitiated" | "UnSetRefundRequestedRequested" | "UnSetRefundRequestedInitiated" | "WithdrawRefundRequested" | "WithdrawRefundInitiated"; errorType: "NetworkError" | "InsufficientFunds" | "Unknown"; errorNote: string | null; } | { requestedAction: "None" | "Ignore" | "WaitingForManualAction" | "WaitingForExternalAction" | "SubmitResultRequested" | "SubmitResultInitiated" | "WithdrawRequested" | "WithdrawInitiated" | "AuthorizeRefundRequested" | "AuthorizeRefundInitiated"; errorType: "NetworkError" | "Unknown"; errorNote: string | null; }; CurrentTransaction: { id: string; createdAt: string; updatedAt: string; txHash: string; status: "Pending" | "Confirmed" | "FailedViaTimeout"; } | { id: string; createdAt: string; updatedAt: string; txHash: string | null; } | null; TransactionHistory: { id: string; createdAt: string; updatedAt: string; txHash: string; status: "Pending" | "Confirmed" | "FailedViaTimeout"; }[] | { id: string; createdAt: string; updatedAt: string; txHash: string | null; }[] | null; Amounts: { id: string; createdAt: string; updatedAt: string; amount: string; unit: string; }[] | { id: string; createdAt: string; updatedAt: string; amount: string; unit: string; }[]; PaymentSource: { id: string; network: "Preprod" | "Mainnet"; smartContractAddress: string; paymentType: "Web3CardanoV1"; } | { id: string; network: "Preprod" | "Mainnet"; smartContractAddress: string; paymentType: "Web3CardanoV1"; }; SellerWallet?: { id: string; walletVkey: string; } | null; SmartContractWallet: { id: string; walletVkey: string; walletAddress: string; } | { id: string; walletVkey: string; walletAddress: string; } | null; metadata: string | null; type: string; BuyerWallet?: { id: string; walletVkey: string; } | null; } | null>(null);
  const { apiClient } = useAppContext();


  const fetchTransactions = useCallback(async (cursor?: string) => {
    setIsLoading(true);
    try {
      const combined: { id: string; createdAt: string; updatedAt: string; blockchainIdentifier: string; lastCheckedAt: string | null; submitResultTime: string; unlockTime: string; externalDisputeUnlockTime: string; requestedById: string; onChainState: "FundsLocked" | "FundsOrDatumInvalid" | "ResultSubmitted" | "RefundRequested" | "Disputed" | "Withdrawn" | "RefundWithdrawn" | "DisputedWithdrawn"; cooldownTime: number; cooldownTimeOtherParty: number; resultHash: string; NextAction: { requestedAction: "None" | "Ignore" | "WaitingForManualAction" | "WaitingForExternalAction" | "FundsLockingRequested" | "FundsLockingInitiated" | "SetRefundRequestedRequested" | "SetRefundRequestedInitiated" | "UnSetRefundRequestedRequested" | "UnSetRefundRequestedInitiated" | "WithdrawRefundRequested" | "WithdrawRefundInitiated"; errorType: "NetworkError" | "InsufficientFunds" | "Unknown"; errorNote: string | null; } | { requestedAction: "None" | "Ignore" | "WaitingForManualAction" | "WaitingForExternalAction" | "SubmitResultRequested" | "SubmitResultInitiated" | "WithdrawRequested" | "WithdrawInitiated" | "AuthorizeRefundRequested" | "AuthorizeRefundInitiated"; errorType: "NetworkError" | "Unknown"; errorNote: string | null; }; CurrentTransaction: { id: string; createdAt: string; updatedAt: string; txHash: string; status: "Pending" | "Confirmed" | "FailedViaTimeout"; } | { id: string; createdAt: string; updatedAt: string; txHash: string | null; } | null; TransactionHistory: { id: string; createdAt: string; updatedAt: string; txHash: string; status: "Pending" | "Confirmed" | "FailedViaTimeout"; }[] | { id: string; createdAt: string; updatedAt: string; txHash: string | null; }[] | null; Amounts: { id: string; createdAt: string; updatedAt: string; amount: string; unit: string; }[] | { id: string; createdAt: string; updatedAt: string; amount: string; unit: string; }[]; PaymentSource: { id: string; network: "Preprod" | "Mainnet"; smartContractAddress: string; paymentType: "Web3CardanoV1"; } | { id: string; network: "Preprod" | "Mainnet"; smartContractAddress: string; paymentType: "Web3CardanoV1"; }; SellerWallet?: { id: string; walletVkey: string; } | null; SmartContractWallet: { id: string; walletVkey: string; walletAddress: string; } | { id: string; walletVkey: string; walletAddress: string; } | null; metadata: string | null; type: string; BuyerWallet?: { id: string; walletVkey: string; } | null; }[] = [];
      const purchases = await getPurchase({
        client: apiClient,
        query: {
          network: network,
          cursorId: cursor,
          smartContractAddress: contractAddress,
          includeHistory: "true",
          limit: 10
        }
      });
      purchases.data?.data?.purchases.forEach((purchase) => {
        combined.push({
          type: 'purchase',
          ...purchase
        });
      });

      const payments = await getPayment({
        client: apiClient,
        query: {
          network: network,
          cursorId: cursor,
          smartContractAddress: contractAddress,
          includeHistory: "true",
          limit: 10
        }
      });
      payments.data?.data?.payments.forEach((payment) => {
        combined.push({
          type: 'payment',
          ...payment
        });
      });

      const newTransactions = combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTransactions(prev => cursor ? [...prev, ...newTransactions] : newTransactions);
      setHasMore(purchases.data?.data?.purchases.length === 10 || payments.data?.data?.payments.length === 10);
      setCursorIdentifier(newTransactions[newTransactions.length - 1]?.id ?? null);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, contractAddress, network]);

  useEffect(() => {
    if (contractAddress || network || paymentType) {
      fetchTransactions();
    }
  }, [contractAddress, fetchTransactions, network, paymentType]);

  const handleLoadMore = () => {
    if (cursorIdentifier && !isLoading) {
      fetchTransactions(cursorIdentifier);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'payments' && tx.type === 'payment') ||
      (filter === 'purchases' && tx.type === 'purchase') ||
      (filter === 'errors' && tx.NextAction?.errorType);

    const searchTerm = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      tx.id.toLowerCase().includes(searchTerm) ||
      tx.NextAction?.errorNote?.toLowerCase().includes(searchTerm) ||
      tx.onChainState?.toLowerCase().includes(searchTerm) ||
      tx.CurrentTransaction?.txHash?.toLowerCase().includes(searchTerm)

    return matchesFilter && matchesSearch;
  });

  const getStatusColor = (status: string, hasError?: boolean) => {
    if (hasError) return "text-destructive";
    if (!status) return "text-muted-foreground";
    switch (status?.toLowerCase()) {
      case 'payment received':
      case 'completed':
        return "text-green-500";
      case 'processing':
      case 'waiting on output':
        return "text-yellow-500";
      case 'failed':
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Transactions</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? "default" : "secondary"}
              onClick={() => setFilter('all')}
            >
              All
            </Button>
            <Button
              variant={filter === 'payments' ? "default" : "secondary"}
              onClick={() => setFilter('payments')}
            >
              Payments
            </Button>
            <Button
              variant={filter === 'purchases' ? "default" : "secondary"}
              onClick={() => setFilter('purchases')}
            >
              Purchases
            </Button>
            <Button
              variant={filter === 'errors' ? "default" : "secondary"}
              onClick={() => setFilter('errors')}
            >
              Errors
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions by ID, status, txHash, error note..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-lg text-muted-foreground">Fetching transactions...</div>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No transactions found.</div>
        ) : (
          <div className="rounded-md border">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background">ID</TableHead>
                    <TableHead className="sticky top-0 bg-background">Type</TableHead>
                    <TableHead className="sticky top-0 bg-background">Status</TableHead>
                    <TableHead className="sticky top-0 bg-background">Amount</TableHead>
                    <TableHead className="sticky top-0 bg-background">Network</TableHead>
                    <TableHead className="sticky top-0 bg-background">Payment Type</TableHead>
                    <TableHead className="sticky top-0 bg-background min-w-[100px]">Tx Hash</TableHead>
                    <TableHead className="sticky top-0 bg-background">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((tx, index: number) => (
                    <TableRow
                      key={tx.id || index}
                      className={`cursor-pointer ${tx.NextAction?.errorType
                        ? 'bg-destructive/10 hover:bg-destructive/20'
                        : 'hover:bg-muted/50'
                        }`}
                      onClick={() => {
                        setSelectedTransaction(tx)
                      }}
                    >
                      <TableCell className="font-medium">
                        {shortenText(tx.id, MAX_ID_LENGTH)}
                      </TableCell>
                      <TableCell>{tx.type === 'payment' ? 'Payment' : 'Purchase'}</TableCell>
                      <TableCell className={getStatusColor(tx.onChainState, !!tx.NextAction?.errorType)}>
                        {formatStatus(tx.onChainState) || '-'}
                      </TableCell>
                      <TableCell>
                        {tx.Amounts?.length
                          ? `${(tx.Amounts.reduce((sum, amt) => sum + parseInt(amt.amount), 0) / 1000000).toFixed(2)} ₳`
                          : '-'}
                      </TableCell>
                      <TableCell className="min-w-[100px]">
                        {tx.PaymentSource?.network}
                      </TableCell>
                      <TableCell className="min-w-[100px]">
                        {tx.PaymentSource?.paymentType}
                      </TableCell>
                      <TableCell className="min-w-[100px]">
                        {tx.CurrentTransaction?.txHash ? shortenText(tx.CurrentTransaction.txHash, MAX_HASH_LENGTH) : '-'}
                      </TableCell>
                      <TableCell>{new Date(tx.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {hasMore && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center">
                        <Button onClick={handleLoadMore}>Load More</Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <h4 className="font-semibold mb-1">Transaction ID</h4>
                  <div className="flex items-center gap-2 bg-muted/30 rounded-md p-2">
                    <p className="text-sm font-mono break-all">
                      {shortenText(selectedTransaction.id, MAX_ID_LENGTH)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 ml-auto shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(selectedTransaction.id);
                        toast.success('Transaction ID copied to clipboard!');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Type</h4>
                  <p className="text-sm capitalize">{selectedTransaction.type}</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Created</h4>
                  <p className="text-sm">{new Date(selectedTransaction.createdAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Transaction Details</h4>
                <div className="grid grid-cols-2 gap-4 rounded-md border p-4 bg-muted/10">
                  <div>
                    <h5 className="text-sm font-medium mb-1">Status</h5>
                    <p className={`text-sm ${getStatusColor(selectedTransaction.onChainState, !!selectedTransaction.NextAction?.errorType)}`}>
                      {formatStatus(selectedTransaction.onChainState)}
                    </p>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium mb-1">Amount</h5>
                    <p className="text-sm">
                      {selectedTransaction.Amounts?.[0]?.amount
                        ? `${(parseInt(selectedTransaction.Amounts[0].amount) / 1000000).toFixed(2)} ₳`
                        : '-'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <h5 className="text-sm font-medium mb-1">Transaction Hash</h5>
                    {selectedTransaction.CurrentTransaction?.txHash ? (
                      <div className="flex items-center gap-2 bg-muted/30 rounded-md p-2">
                        <p className="text-sm font-mono break-all">{selectedTransaction.CurrentTransaction.txHash}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-auto shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(selectedTransaction.CurrentTransaction?.txHash ?? "");
                            toast.success('Transaction hash copied to clipboard!');
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No transaction hash available</p>
                    )}
                  </div>
                  {/* <div className="col-span-2">
                    <h5 className="text-sm font-medium mb-1">UTXO</h5>
                    <p className="text-sm font-mono break-all">{selectedTransaction.utxo || '-'}</p>
                  </div> */}
                </div>
              </div>

              {selectedTransaction.type === 'payment' && <div className="space-y-2">
                <h4 className="font-semibold">Wallet Information</h4>
                <div className="grid grid-cols-1 gap-4 rounded-md border p-4">
                  <div>
                    <h5 className="text-sm font-medium mb-1">Collection Wallet</h5>
                    <p className="text-sm font-mono break-all">
                      {selectedTransaction.SmartContractWallet?.walletAddress || '-'}
                    </p>
                  </div>
                </div>
              </div>}
              {selectedTransaction.NextAction?.errorType && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Error Details</h4>
                  <div className="space-y-2 rounded-md bg-destructive/20 p-4">
                    <div className="space-y-1">
                      <p className="text-sm"><span className="font-medium">Error Type:</span> {selectedTransaction.NextAction.errorType}</p>
                      {selectedTransaction.NextAction.errorNote && (
                        <p className="text-sm"><span className="font-medium">Error Note:</span> {selectedTransaction.NextAction.errorNote}</p>
                      )}
                      {selectedTransaction.NextAction.requestedAction === "WaitingForManualAction" && (
                        <p className="text-sm font-medium text-destructive mt-2">⚠️ This error requires manual review</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}