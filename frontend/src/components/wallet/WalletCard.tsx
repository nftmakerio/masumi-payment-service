import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useState, useCallback } from "react";
import { useAppContext } from '@/lib/contexts/AppContext';
import { Copy } from "lucide-react";
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import BlinkingUnderscore from "../BlinkingUnderscore";
import { getWallet } from "@/lib/api/wallet";
import { getWalletBalance } from "@/lib/api/balance/get";
import { TransakWidget } from './TransakWidget';

export function WalletCard({
  type,
  address,
  walletId,
  onRemove,
  contract
}: {
  type: string;
  address: string;
  contractName: string;
  walletId?: string;
  onRemove?: () => void;
  contract: {
    id: string;
    paymentContractAddress: string;
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
  };
}) {
  const [adaBalance, setAdaBalance] = useState<number | null>(null);
  const [usdmBalance, setUsdmBalance] = useState<number | null>(null);
  const [fetchingBalance, setFetchingBalance] = useState<boolean>(true);
  const [balanceError, setBalanceError] = useState<unknown>(null);
  const [localAddress, setLocalAddress] = useState<string | null>(address || null);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const { state } = useAppContext();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [walletSecret, setWalletSecret] = useState<string | null>(null);
  const [showTransak, setShowTransak] = useState(false);

  const walletType = type === 'selling' ? 'Selling' : 'Purchasing';

  const fetchWalletAddress = useCallback(async () => {
    try {
      setIsFetchingAddress(true);
      const response = await getWallet(state.apiKey!, {
        walletType,
        id: walletId!,
        includeSecret: true
      });


      const data = response.data?.wallet;
      return data?.walletAddress;
    } catch (error) {
      console.error('Error fetching wallet address:', error);
      return null;
    } finally {
      setIsFetchingAddress(false);
    }
  }, [walletId, state.apiKey, walletType]);

  useEffect(() => {
    if (!localAddress && walletId) {
      fetchWalletAddress().then(fetchedAddress => {
        if (fetchedAddress) {
          setLocalAddress(fetchedAddress);
        }
      });
    }
  }, [fetchWalletAddress, localAddress, walletId]);

  const fetchBalancePreprod = useCallback(async (address: string) => {
    try {
      setFetchingBalance(true);
      const data = await getWalletBalance(state.apiKey!, {
        walletAddress: address,
        network: 'preprod',
        blockfrostApiKey: contract.NetworkHandlerConfig.rpcProviderApiKey
      });

      setAdaBalance(data?.ada || 0);
      setUsdmBalance(data?.usdm || 0);
      setFetchingBalance(false);
      return data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error fetching balance';
      setBalanceError(errorMessage);
      console.error("Error fetching balance:", errorMessage);
      throw error;
    }
  }, [contract.NetworkHandlerConfig.rpcProviderApiKey, state.apiKey]);

  useEffect(() => {
    const fetchBalances = async () => {
      const defaultContract = state.paymentSources?.[0];
      const apiKey = defaultContract?.NetworkHandlerConfig?.rpcProviderApiKey;

      if (!apiKey) {
        const errorMessage = 'No Blockfrost API key found';
        console.error(errorMessage);
        setBalanceError(errorMessage);
        return;
      }

      try {
        setFetchingBalance(true);
        setBalanceError(null);
        const data = await fetchBalancePreprod(localAddress || '');
        setAdaBalance(data?.ada || 0);
        setUsdmBalance(data?.usdm || 0);
      } catch (error) {
        const errorMessage = error instanceof Error 
          ? error.message 
          : 'Unknown error fetching balance';
        console.error('Error fetching wallet balances:', errorMessage);
        setBalanceError(errorMessage);
      } finally {
        setFetchingBalance(false);
      }
    };

    if (localAddress) {
      fetchBalances();
    }
  }, [fetchBalancePreprod, localAddress, state.paymentSources]);

  const refreshBalance = async () => {
    try {
      setBalanceError(null);
      setFetchingBalance(true);
      const data = await fetchBalancePreprod(localAddress || '');
      setAdaBalance(data?.ada || 0);
      setUsdmBalance(data?.usdm || 0);
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error fetching balance';
      console.error('Error fetching wallet balances:', errorMessage);
      setBalanceError(errorMessage);
    } finally {
      setFetchingBalance(false);
    }
  };

  const handleTopUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTransak(true);
  };

  const handleTransakClose = () => {
    setShowTransak(false);
  };

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExporting(true);

    try {
      const response = await getWallet(state.apiKey!, {
        walletType,
        id: walletId!,
        includeSecret: true
      });

      const data = response.data?.wallet;
      setWalletSecret(data?.WalletSecret?.secret || '');
      setShowExportDialog(true);
    } catch (error) {
      console.error('Error exporting wallet:', error);
      toast.error('Failed to export wallet');
    } finally {
      setIsExporting(false);
    }
  };


  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
  };

  const handleCopyAddress = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard!');
  };

  const getDisplayContent = () => {

    return (
      <>
        <div className="flex justify-between items-center">
          <div className="text-sm truncate flex-1">
            {isFetchingAddress ? (
              <span className="text-muted-foreground">Fetching address...</span>
            ) : (
              <>
                Address: {localAddress ? shortenAddress(localAddress) : <BlinkingUnderscore />}
                {localAddress && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-2"
                    onClick={(e) => handleCopyAddress(e, localAddress || '')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          {balanceError ? (
            <div className="space-y-2">
              <div className="text-sm text-destructive">{balanceError as string}</div>
              <Button
                variant="secondary"
                size="sm"
                onClick={refreshBalance}
                className="w-fit px-2 py-1 h-auto text-xs"
              >
                Try Again
              </Button>
            </div>
          ) : !fetchingBalance ? (
            <>
              <div className="text-sm">ADA Balance: {adaBalance?.toLocaleString() || "..."} ₳</div>
              <div className="text-sm">USDM Balance: {usdmBalance?.toLocaleString() || "..."} USDM</div>
              <Button
                variant="secondary"
                size="sm"
                onClick={refreshBalance}
                className="w-fit px-2 py-1 h-auto text-xs"
              >
                Refresh Balance
              </Button>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              fetching balance...
            </div>
          )}
        </div>

        <div className="flex gap-1 justify-start mt-1">
          {(type === 'purchasing' || type === 'selling') && (
            <>
              <Button variant="secondary" size="sm" onClick={handleTopUp}>
                Top Up
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExport} disabled={isExporting}>
                {isExporting ? 'Exporting...' : 'Export'}
              </Button>
            </>
          )}
        </div>

        {(type === 'purchasing' || type === 'selling') && walletId && (
          <Button
            variant="destructive"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteDialog(true);
            }}

            style={{ maxWidth: '100px' }}
          >
            Remove Wallet
          </Button>
        )}
      </>
    );
  };

  return (
    <>
      <Card className="bg-[#ffffff03] hover:bg-[#ffffff06]">
        <CardContent className="space-y-1 py-4 px-3 flex flex-col gap-3">
          {getDisplayContent()}
        </CardContent>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Wallet</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this wallet? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.();
                setShowDeleteDialog(false);
              }}
            >
              Remove Wallet
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet Secret</DialogTitle>
            <DialogDescription>
              Please store this secret phrase securely. Anyone with access to this phrase can control the wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-md">
              <p className="text-sm break-all font-mono">{walletSecret}</p>
            </div>

          </div>

          <div className="flex justify-end space-x-2">
            <Button
              onClick={() => {
                navigator.clipboard.writeText(walletSecret || '');
                toast.success('Secret copied to clipboard!');
              }}
            >
              Copy to Clipboard
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowExportDialog(false);
                setWalletSecret(null);
              }}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showTransak && (
        <TransakWidget
          isOpen={showTransak}
          onClose={handleTransakClose}
          walletAddress={localAddress || ''}
          network={contract.network}
          onSuccess={() => {
            refreshBalance?.();
          }}
        />
      )}
    </>
  );
}