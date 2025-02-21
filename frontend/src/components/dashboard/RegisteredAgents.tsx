/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useAppContext } from '@/lib/contexts/AppContext';
import { Button } from "@/components/ui/button";
import { Pagination } from "../ui/pagination";
import BlinkingUnderscore from '../BlinkingUnderscore';
import { RegisterAgentModal } from './RegisterAgentModal';
import { getRegisteredAgents } from '@/lib/api/get-registered-agents';
import { toast } from 'react-toastify';

interface RegisteredAgentsProps {
  paymentContractAddress: string;
  network: 'PREPROD' | 'MAINNET';
  sellingWallets: {
    walletVkey: string;
    collectionAddress: string;
  }[];
}

export function RegisteredAgents({ paymentContractAddress, network, sellingWallets }: RegisteredAgentsProps) {
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const { state } = useAppContext();
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const fetchAgents = useCallback(async (nextCursor?: string) => {
    if (!state.apiKey) return;

    const walletVKey = sellingWallets[0]?.walletVkey;

    if (!walletVKey) {
      console.error('No selling wallet vkey available');
      return;
    }

    setIsLoading(true);
    try {
      if (!paymentContractAddress) {
        throw new Error('Payment contract address is required');
      }

      if (!network) {
        throw new Error('Network is required');
      }

      if (!sellingWallets) {
        throw new Error('Selling wallet vkey is required');
      }

      const response = await getRegisteredAgents(state.apiKey, 10, nextCursor, walletVKey, network, paymentContractAddress);

      const agentsFound = response.data.assets;
      setAgents(prevAgents =>
        nextCursor
          ? [...prevAgents, ...agentsFound]
          : agentsFound
      );
      setHasMore(response.data.hasMore);
      setCursor(response.data.nextCursor);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      toast.error('Failed to fetch registered agents');
    } finally {
      setIsLoading(false);
    }
  }, [state.apiKey, sellingWallets, paymentContractAddress, network]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleRegisterSuccess = () => {
    setShowRegisterModal(false);
    fetchAgents();
    toast.success('Agent registered successfully');
  };

  if (isLoading && agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registered Agents</CardTitle>
        </CardHeader>
        <div className="p-4">
          <BlinkingUnderscore />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Registered Agents</CardTitle>
        <Button onClick={() => setShowRegisterModal(true)}>
          Register Agent
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>API URL</TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.agentIdentifier}>
                    <TableCell className="font-medium">{agent.metadata.name}</TableCell>
                    <TableCell>{agent.metadata.description}</TableCell>
                    <TableCell>{agent.metadata.api_url}</TableCell>
                    <TableCell>{agent.metadata.tags.join(', ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            hasMore={hasMore}
            isLoading={isLoading}
            onLoadMore={() => cursor && fetchAgents(cursor)}
            className="mt-4"
          />
        </div>
        {showRegisterModal && (
          <RegisterAgentModal 
            onClose={() => setShowRegisterModal(false)}
            onSuccess={handleRegisterSuccess}
            paymentContractAddress={paymentContractAddress}
            network={network}
            sellingWallets={sellingWallets}
          />
        )}
      </CardContent>
    </Card>
  );
} 