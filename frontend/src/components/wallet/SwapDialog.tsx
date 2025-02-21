/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */



import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getWalletBalance } from "@/lib/api/balance/get";
import swappableTokens from "@/assets/swappableTokens.json";
import { FaExchangeAlt } from "react-icons/fa";
import { getWallet } from "@/lib/api/wallet";
import { useAppContext } from "@/lib/contexts/AppContext";
import { toast } from "react-toastify";
import BlinkingUnderscore from "../BlinkingUnderscore";
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
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [isAdaToUsdm, setIsAdaToUsdm] = useState<boolean>(true);
  const [swapDetails, setSwapDetails] = useState<{
    fromToken: string;
    toToken: string;
    fromAmount: number;
    toAmount: number;
  } | null>(null);

  const [fromAmount, setFromAmount] = useState<number>(1);
  const [adaToUsdRate, setAdaToUsdRate] = useState<number>(0);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState<boolean>(true);

  const adaIndex = swappableTokens.findIndex(token => token.symbol === 'ADA');
  const usdmIndex = swappableTokens.findIndex(token => token.symbol === 'USDM');

  const [selectedFromToken, setSelectedFromToken] = useState(swappableTokens[adaIndex]);
  const [selectedToToken, setSelectedToToken] = useState(swappableTokens[usdmIndex]);

  useEffect(() => {
    if (isOpen) {
      setIsFetchingDetails(true);
      fetchBalance();
      fetchAdaToUsdRate();
      fetchMnemonic();
    }
  }, [isOpen]);

  const fetchBalance = async () => {
    try {
      const data = await getWalletBalance(state?.apiKey || "", {
        walletAddress,
        network,
        blockfrostApiKey,
      });
      setAdaBalance(data.ada);
      setUsdmBalance(data.usdm);
      setBalanceError(null);
    } catch (error) {
      console.error("Failed to fetch balance", error);
      setBalanceError("Failed to fetch balance");
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const fetchAdaToUsdRate = async () => {
    try {
      const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=usd");
      const data = await response.json();
      setAdaToUsdRate(data.cardano.usd);
    } catch (error) {
      console.error("Failed to fetch ADA to USD rate", error);
    }
  };

  const fetchMnemonic = async () => {
    setLoading(true);
    try {
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
    } catch (error: any) {
      console.error("Failed to fetch mnemonic", error);
      toast.error("Failed to fetch mnemonic: " + error?.message, { theme: "dark" });
      setMnemonic(null);
    } finally {
      setLoading(false);
      setIsFetchingDetails(false);
    }
  };

  const canSwap = adaBalance > 0 && selectedFromToken.symbol !== selectedToToken.symbol && network?.toLowerCase() !== "preprod" && mnemonic !== null;

  const handleSwitch = () => {
    setSelectedFromToken(selectedToToken);
    setSelectedToToken(selectedFromToken);
  };

  const handleTokenChange = (type: 'from' | 'to', tokenIndex: number) => {
    const selectedToken = swappableTokens[tokenIndex];

    if (type === 'from') {
      setSelectedFromToken(selectedToken);
      if (selectedToken.symbol === selectedToToken.symbol) {
        setSelectedToToken(selectedFromToken);
      }
    } else {
      setSelectedToToken(selectedToken);
      if (selectedToken.symbol === selectedFromToken.symbol) {
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
      default:
        return 0;
    }
  };

  const handleFromAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const filteredValue = value.replace(/[^0-9.]/g, '');
    const parsedValue = parseFloat(filteredValue);
    setFromAmount(parsedValue >= 1 ? parsedValue : 1);
  };

  const dollarValue = selectedFromToken.symbol === 'ADA'
    ? fromAmount * adaToUsdRate
    : fromAmount;

  const formattedDollarValue = selectedFromToken.symbol === 'USDM'
    ? `~$${dollarValue.toFixed(2)}`
    : `$${dollarValue.toFixed(2)}`;

  const toAmount = fromAmount * 0.80296;

  const conversionRate = adaToUsdRate;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap Tokens</DialogTitle>
        </DialogHeader>
        {isFetchingDetails ? (
          <div className="text-center text-gray-500 mb-4">
            <BlinkingUnderscore />
          </div>
        ) : (
          <>
            {adaBalance === 0 && (
              <div className="text-red-500 mb-4">Cannot swap zero balance</div>
            )}
            {network?.toLowerCase() === "preprod" && (
              <div className="text-red-500 mb-4">Can't perform swap on <b>{network?.toUpperCase()}</b> network</div>
            )}
            <div
              style={{
                opacity: canSwap ? 1 : 0.4,
                pointerEvents: canSwap ? "auto" : "none",
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
                      <img src={selectedFromToken.icon} alt="Token" className="w-6 h-6" />
                    </div>
                    <div className="text-xs text-gray-500">
                      Balance: {getBalanceForToken(selectedFromToken.symbol).toFixed(6)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <input
                      type="number"
                      className="w-24 text-right bg-transparent border-b border-gray-500 focus:outline-none appearance-none text-[24px] font-bold mb-2"
                      placeholder="0"
                      value={fromAmount}
                      onChange={handleFromAmountChange}
                      step="0.2"
                      style={{ MozAppearance: "textfield" }}
                    />
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
                      <img src={selectedToToken.icon} alt="Token" className="w-6 h-6" />
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
                  1 ADA ≈ {conversionRate.toFixed(5)} USDM
                </div>
                <Button variant="default" className="w-full" disabled={!canSwap || loading}>
                  {loading ? "Loading..." : "Swap"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
} 