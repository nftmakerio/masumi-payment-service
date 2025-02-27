/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */



import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getWalletBalance } from "@/lib/api/balance/get";
import swappableTokens from "@/assets/swappableTokens.json";
import { FaExchangeAlt } from "react-icons/fa";
import { getWallet } from "@/lib/api/wallet";
import { useAppContext } from "@/lib/contexts/AppContext";
import { toast } from "react-toastify";
import BlinkingUnderscore from "../BlinkingUnderscore";
import { MaestroProvider } from '@meshsdk/core'
import { shortenAddress } from "@/lib/utils";
import { executeSwap } from "@/lib/api/swap";
import { Token } from "@/types/token";
import { Spinner } from "../ui/spinner";
interface SwapDialogProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  network: string;
  blockfrostApiKey: string;
  walletType: string;
  walletId: string;
}

export function SwapDialog({ isOpen, onClose, walletAddress, network, blockfrostApiKey, walletType, walletId }: SwapDialogProps) {
  const { state } = useAppContext();
  const [adaBalance, setAdaBalance] = useState<number>(0);
  const [usdmBalance, setUsdmBalance] = useState<number>(0);
  const [nmkrBalance, setNmkrBalance] = useState<number>(0);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fromAmount, setFromAmount] = useState<number>(1);
  const [adaToUsdRate, setAdaToUsdRate] = useState<number>(0);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState<boolean>(true);
  const [isSwapping, setIsSwapping] = useState<boolean>(false);
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);

  const adaIndex = swappableTokens.findIndex(token => token.symbol === 'ADA');
  const usdmIndex = swappableTokens.findIndex(token => token.symbol === 'USDM');

  const [selectedFromToken, setSelectedFromToken] = useState(swappableTokens[adaIndex]);
  const [selectedToToken, setSelectedToToken] = useState(swappableTokens[usdmIndex]);

  const isDev = process.env.NEXT_PUBLIC_DEV === "Isaac";
  const devWalletAddress = process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS || "";
  
  const effectiveWalletAddress = isDev ? devWalletAddress : walletAddress;

  const [tokenRates, setTokenRates] = useState<Record<string, number>>({});

  const [swapStatus, setSwapStatus] = useState<'idle' | 'processing' | 'submitted' | 'confirmed'>('idle');

  const fetchTokenRates = async () => {
    try {
      const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd");
      const data = await response.json();
      setAdaToUsdRate(data?.cardano?.usd || 0);

      const rates: Record<string, number> = {};
      for (const token of swappableTokens) {
        if (token.symbol !== 'ADA' && token.policyId && token.hexedAssetName) {
          const url = `https://dhapi.io/swap/averagePrice/ADA/${token.policyId}${token.hexedAssetName}`;
          try {
            const response = await fetch(url);
            const data = await response.json();
            rates[token.symbol] = data.price_ab || 0;
          } catch (error) {
            console.error(`Failed to fetch rate for ${token.symbol}`, error);
            rates[token.symbol] = 0;
          }
        }
      }
      setTokenRates(rates);
    } catch (error) {
      console.error("Failed to fetch rates", error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsFetchingDetails(true);
      fetchBalance();
      fetchTokenRates();
      fetchMnemonic();

      const balanceInterval = setInterval(() => {
        fetchBalance();
      }, 20000);

      return () => clearInterval(balanceInterval);
    }
  }, [isOpen]);

  const fetchBalance = async () => {
    try {
      const data = await getWalletBalance(state?.apiKey || "", {
        walletAddress: effectiveWalletAddress,
        network: isDev ? process.env.NEXT_PUBLIC_DEV_NETWORK || "" : network,
        blockfrostApiKey: isDev ? process.env.NEXT_PUBLIC_DEV_BLOCKFROST_API_KEY || "" : blockfrostApiKey,
      });
      setAdaBalance(data.ada);
      setUsdmBalance(data.usdm);
      setNmkrBalance(data.nmkr);
      setBalanceError(null);
    } catch (error) {
      console.error("Failed to fetch balance", error);
      setBalanceError("Failed to fetch balance");
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const fetchMnemonic = async () => {
    setLoading(true);
    try {
      if (isDev) {
        setMnemonic(process.env.NEXT_PUBLIC_DEV_WALLET_MNEMONIC || null);
      } else {
        if (!state?.apiKey) {
          throw new Error("No API key found");
        }

        if (!walletId) {
          throw new Error("No wallet ID found");
        }

        if (!walletType) {
          throw new Error("No wallet type found");
        }

        const type = walletType?.toLowerCase() === "purchasing" ? "Purchasing" : "Selling";

        const response = await getWallet(state?.apiKey || "", {
          walletType: type,
          id: walletId,
          includeSecret: true,
        });

        const fetchedMnemonic = response.data?.Secret?.mnemonic || null;
        setMnemonic(fetchedMnemonic);
      }
    } catch (error: any) {
      console.error("Failed to fetch mnemonic", error);
      toast.error("Failed to fetch mnemonic: " + error?.message, { theme: "dark" });
      setMnemonic(null);
    } finally {
      setLoading(false);
      setIsFetchingDetails(false);
    }
  };

  const canSwap = isDev ? true : (adaBalance > 0 && selectedFromToken.symbol !== selectedToToken.symbol && network?.toLowerCase() !== "preprod" && mnemonic !== null);

  const handleSwitch = () => {
    if (selectedFromToken.symbol === 'ADA' || selectedToToken.symbol === 'ADA') {
      setSelectedFromToken(selectedToToken);
      setSelectedToToken(selectedFromToken);
    }
  };

  const handleTokenChange = (type: 'from' | 'to', tokenIndex: number) => {
    const selectedToken = swappableTokens[tokenIndex];

    if (type === 'from') {
      setSelectedFromToken(selectedToken);
      if (selectedToken.symbol !== 'ADA' && selectedToToken.symbol !== 'ADA') {
        setSelectedToToken(swappableTokens[adaIndex]);
      } else if (selectedToken.symbol === selectedToToken.symbol) {
        setSelectedToToken(selectedFromToken);
      }
    } else {
      setSelectedToToken(selectedToken);
      if (selectedToken.symbol !== 'ADA' && selectedFromToken.symbol !== 'ADA') {
        setSelectedFromToken(swappableTokens[adaIndex]);
      } else if (selectedToken.symbol === selectedFromToken.symbol) {
        setSelectedFromToken(selectedToToken);
      }
    }
  };

  const getBalanceForToken = (tokenSymbol: string) => {
    switch (tokenSymbol) {
      case 'ADA':
        return adaBalance;
      case 'USDM':
        return usdmBalance;
      case 'NMKR':
        return nmkrBalance;
      default:
        return 0;
    }
  };

  const getMaxAmount = (tokenSymbol: string) => {
    const balance = getBalanceForToken(tokenSymbol);
    if (tokenSymbol === 'ADA') {
      return Math.max(0, balance - 3);
    }
    return balance;
  };

  const handleMaxClick = () => {
    setFromAmount(getMaxAmount(selectedFromToken.symbol));
  };

  const handleFromAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const filteredValue = value.replace(/[^0-9.]/g, '');
    const parsedValue = parseFloat(filteredValue);
    const normalizedValue = isNaN(parsedValue) ? 0 : Number(parsedValue);
    setFromAmount(normalizedValue);
  };

  const getConversionRate = () => {
    if (selectedFromToken.symbol === 'ADA' && selectedToToken.symbol === 'USDM') {
      return adaToUsdRate;
    } else if (selectedFromToken.symbol === 'USDM' && selectedToToken.symbol === 'ADA') {
      return 1 / adaToUsdRate;
    } else if (selectedFromToken.symbol === 'ADA') {
      return tokenRates[selectedToToken.symbol] || 0;
    } else if (selectedToToken.symbol === 'ADA') {
      return 1 / (tokenRates[selectedFromToken.symbol] || 1);
    } else {
      const fromTokenInAda = tokenRates[selectedFromToken.symbol] || 0;
      const toTokenInAda = tokenRates[selectedToToken.symbol] || 0;
      return toTokenInAda > 0 ? fromTokenInAda / toTokenInAda : 0;
    }
  };

  const conversionRate = getConversionRate();
  const toAmount = fromAmount * conversionRate;

  const formattedDollarValue = selectedFromToken.symbol === 'USDM'
    ? `~$${fromAmount.toFixed(2)}`
    : `$${toAmount.toFixed(2)}`;

  const maestroProvider = new MaestroProvider({
    network: 'Mainnet',
    apiKey: process.env.NEXT_PUBLIC_MAESTRO_API_KEY || "",
  });

  const handleSwapClick = () => {
    setShowConfirmation(true);
  };

  const handleConfirmSwap = async () => {
    setShowConfirmation(false);
    setIsSwapping(true);
    setError(null);
    try {
      if (!mnemonic) {
        throw new Error("Mnemonic not available");
      }
      setTimeout(() => {
        setSwapStatus('processing');
      }, 500);

      const result = await executeSwap({
        mnemonic,
        amount: fromAmount,
        isFromAda: selectedFromToken.symbol === 'ADA',
        fromToken: selectedFromToken as Token,
        toToken: selectedToToken as Token,
        poolId: selectedFromToken.poolId || selectedToToken.poolId || ""
      });

      setSwapStatus('submitted');
      toast.info("Swap submitted!", { theme: "dark" });
      await fetchBalance();
      
      maestroProvider.onTxConfirmed(result.txHash, async () => {
        setSwapStatus('confirmed');
        toast.success("Swap transaction confirmed!", { theme: "dark" });
        await fetchBalance();
        setIsSwapping(false);
        setTimeout(() => setSwapStatus('idle'), 2000);
      });
    } catch (error: any) {
      console.error(error);
      toast.error(`Swap failed: ${error?.response?.data?.error || error?.message}`, { theme: "dark" });
      setError(error?.response?.data?.error || error?.message || "Swap failed");
      setIsSwapping(false);
      setSwapStatus('idle');
    }
  };

  const getProgressBarColor = () => {
    switch (swapStatus) {
      case 'processing':
        return 'bg-orange-500';
      case 'submitted':
        return 'bg-blue-500';
      case 'confirmed':
        return 'bg-green-500';
      default:
        return 'bg-transparent';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="overflow-y-hidden">
        <DialogHeader>
          <DialogTitle>Swap Tokens</DialogTitle>
          <DialogDescription>
            {isDev ? <>
              <b>DEV WALLET</b>
              <br />
              <i>{shortenAddress(effectiveWalletAddress)}</i>
            </> : <>
              {network?.toLowerCase() === "preprod" ? "PREPROD" : "MAINNET"} Network
              <br />
              <i>{shortenAddress(effectiveWalletAddress)}</i>
            </>}
          </DialogDescription>
        </DialogHeader>
        {isFetchingDetails ? (
          <div className="text-center text-gray-500 mb-4">
            <BlinkingUnderscore />
          </div>
        ) : (
          <>
            {!isDev ? <>
              {adaBalance === 0 && (
                <div className="text-red-500 mb-4">Cannot swap zero balance</div>
              )}
              {network?.toLowerCase() === "preprod" && (
                <div className="text-red-500 mb-4">Can't perform swap on <b>{network?.toUpperCase()}</b> network</div>
              )}
            </> : <></>}
            <div
              style={{
                opacity: (canSwap && !isSwapping) ? 1 : 0.4,
                pointerEvents: (canSwap && !isSwapping) ? "auto" : "none",
              }}
            >
              <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center bg-black p-4 rounded-md">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center space-x-2">
                      <select
                        value={swappableTokens.indexOf(selectedFromToken)}
                        onChange={(e) => handleTokenChange('from', parseInt(e.target.value))}
                        className="bg-transparent text-white"
                      >
                        {swappableTokens.map((token, index) => (
                          <option key={token.symbol} value={index}>
                            {token.symbol}
                          </option>
                        ))}
                      </select>
                      <img src={selectedFromToken.icon} alt="Token" className="w-6 h-6 rounded-full" />
                    </div>
                    <div className="text-xs text-gray-500">
                      Balance: {getBalanceForToken(selectedFromToken.symbol).toFixed(6)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="relative w-full">
                      <input
                        type="number"
                        className={`w-24 text-right bg-transparent border-b border-gray-500 focus:outline-none appearance-none text-[24px] font-bold mb-2 ${
                          fromAmount > getMaxAmount(selectedFromToken.symbol) ? 'text-red-500' : ''
                        }`}
                        placeholder="0"
                        value={fromAmount || ''}
                        onChange={handleFromAmountChange}
                        step="0.2"
                        style={{ MozAppearance: "textfield" }}
                      />
                      <span 
                        className="absolute right-0 -top-5 text-xs text-gray-500 cursor-pointer hover:text-gray-400"
                        onClick={handleMaxClick}
                      >
                        Max: {getMaxAmount(selectedFromToken.symbol).toFixed(6)}
                      </span>
                    </div>
                    <span className="block text-xs text-muted-foreground">{formattedDollarValue}</span>
                  </div>
                </div>
                <div className="relative flex items-center">
                  <div className="flex-grow border-t border-gray-600"></div>
                  <Button onClick={handleSwitch} className="mx-4 p-2 w-10 h-10 flex items-center justify-center transform rotate-90">
                    <FaExchangeAlt className="w-5 h-5" />
                  </Button>
                  <div className="flex-grow border-t border-gray-600"></div>
                </div>
                <div className="flex justify-between items-center bg-black p-4 rounded-md">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center space-x-2">
                      <select
                        value={swappableTokens.indexOf(selectedToToken)}
                        onChange={(e) => handleTokenChange('to', parseInt(e.target.value))}
                        className="bg-transparent text-white"
                      >
                        {swappableTokens.map((token, index) => (
                          <option key={token.symbol} value={index}>
                            {token.symbol}
                          </option>
                        ))}
                      </select>
                      <img src={selectedToToken.icon} alt="Token" className="w-6 h-6 rounded-full" />
                    </div>
                    <div className="text-xs text-gray-500">
                      Balance: {getBalanceForToken(selectedToToken.symbol).toFixed(6)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <input
                      type="text"
                      className="w-24 text-right bg-transparent focus:outline-none appearance-none"
                      placeholder="0"
                      value={toAmount.toFixed(6)}
                      readOnly
                    />
                  </div>
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  1 {selectedFromToken.symbol} ≈ {conversionRate.toFixed(5)} {selectedToToken.symbol}
                </div>
                <Button 
                  variant="default" 
                  className="w-full" 
                  onClick={handleSwapClick} 
                  disabled={!canSwap || isSwapping || fromAmount <= 0 || fromAmount > getMaxAmount(selectedFromToken.symbol)}
                >
                  {isSwapping ? "Swap in Progress..." : "Swap"} {isSwapping && <Spinner size="sm" className="ml-1" />}
                </Button>
                {error && <div className="text-red-500 mt-2">{error}</div>}

                {showConfirmation && (
                  <Dialog open={showConfirmation} onOpenChange={() => setShowConfirmation(false)}>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Confirm Swap</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to swap:
                        </DialogDescription>
                        <div className="mt-2 font-medium">
                          {fromAmount} {selectedFromToken.symbol} → {toAmount.toFixed(6)} {selectedToToken.symbol}
                        </div>
                      </DialogHeader>
                      <div className="flex justify-end space-x-2 mt-4">
                        <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleConfirmSwap}>
                          Confirm Swap
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
            {isSwapping && (
              <div className="w-full h-[4px] bg-gray-700 rounded-full overflow-hidden animate-bounce-bottom">
                <div 
                  className={`h-full transition-all duration-1000 ease-in-out ${getProgressBarColor()}`}
                  style={{ 
                    width: swapStatus === 'processing' ? '20%' : 
                            swapStatus === 'submitted' ? '66%' : 
                            swapStatus === 'confirmed' ? '100%' : '0%' 
                  }}
                />
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
} 