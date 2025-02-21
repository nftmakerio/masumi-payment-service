import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useAppContext } from '@/lib/contexts/AppContext';
import { useRouter } from 'next/router';
import { Button } from "@/components/ui/button";
import { CreateContractModal } from "./CreateContractModal";
import { Pagination } from "../ui/pagination";
import Link from "next/link";
import BlinkingUnderscore from '../BlinkingUnderscore';
import { getPaymentSources, PaymentSource } from '@/lib/api/payment-source';

function shortenAddress(address: string) {
  if (!address) return '';
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}



interface MonitoredContractsProps {
  paymentSourceData?: PaymentSource[];
}

export function MonitoredContracts({ }: MonitoredContractsProps) {
  const router = useRouter();
  const [contracts, setContracts] = useState<PaymentSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const { state } = useAppContext();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchContracts = useCallback(async (cursorId?: string) => {
    setIsLoading(true);
    try {
      if (!hasMore) {
        setIsLoading(false);
        return;
      }
      const response = await getPaymentSources(state.apiKey!, 10, cursorId);

      const data = response.data;

      if (data?.paymentSources) {
        setContracts(cursorId ? [...contracts, ...data?.paymentSources] : data?.paymentSources);
        setHasMore(data?.paymentSources.length === 10);
        setCursor(data?.paymentSources[data?.paymentSources.length - 1]?.id || null);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch contracts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [contracts, state.apiKey, hasMore]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRowClick = (contractName: string) => {
    router.push(`/contract/${contractName}`);
  };

  const handleAddContract = () => {
    setShowCreateModal(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monitored Contracts</CardTitle>
        </CardHeader>
        <div className="p-4">
          <BlinkingUnderscore />
          {/* <Skeleton className="h-[200px]" /> */}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Monitored Contracts</CardTitle>
        <Button onClick={handleAddContract}>
          Add Contract
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract Address</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">
                      <Link href={`/contract/${contract.id}`} className="hover:underline">
                        {shortenAddress(contract.paymentContractAddress || contract.smartContractAddress || '')}
                      </Link>
                    </TableCell>
                    <TableCell>{contract.network}</TableCell>
                    <TableCell>{contract.paymentType}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs ${contract.isSyncing === true
                        ? 'bg-blue-500/20 text-blue-500'
                        : 'bg-green-500/20 text-green-500'
                        }`}>
                        {contract.isSyncing === true ? 'Syncing' : 'Active'}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(contract.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            hasMore={hasMore}
            isLoading={isLoading}
            onLoadMore={() => cursor && fetchContracts(cursor)}
            className="mt-4"
          />
        </div>
        {showCreateModal && (
          <CreateContractModal onClose={() => setShowCreateModal(false)} />
        )}
      </CardContent>
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getStatusColor(isSyncing: boolean) {
  if (isSyncing) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  }
  return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
} 