import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from '@/lib/contexts/AppContext';
import { registerAgent } from '@/lib/api/register-agent';
import { toast } from 'react-toastify';
import { shortenAddress } from '@/lib/utils';
interface RegisterAgentModalProps {
  onClose: () => void;
  onSuccess: () => void;
  paymentContractAddress: string;
  network: 'PREPROD' | 'MAINNET';
  sellingWallets: {
    walletVkey: string;
    collectionAddress: string;
  }[];
}

export function RegisterAgentModal({ onClose, onSuccess, paymentContractAddress, sellingWallets, network }: RegisterAgentModalProps) {
  const { state } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    api_url: '',
    authorName: '',
    authorContact: '',
    authorOrganization: '',
    capabilityName: '',
    capabilityVersion: '1.0.0',
    requests_per_hour: '100',
    pricingUnit: 'usdm',
    pricingQuantity: '500',
    tags: [] as string[]
  });
  const [selectedWallet, setSelectedWallet] = useState(sellingWallets[0]?.walletVkey || '');
  const [tagError, setTagError] = useState<string | null>(null);

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, tags: e.target.value.split(',').map(tag => tag.trim()) as string[] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (formData.tags.length === 0 || formData.tags[0] === '') {
      setTagError('Please enter at least one tag.');
      setIsLoading(false);
      return;
    } else {
      setTagError(null);
    }

    try {
      const details = {
        network,
        paymentContractAddress,
        tags: formData.tags,
        name: formData.name,
        api_url: formData.api_url,
        description: formData.description,
        author: {
          name: formData.authorName,
          contact: formData.authorContact || undefined,
          organization: formData.authorOrganization || undefined
        },
        capability: {
          name: formData.capabilityName,
          version: formData.capabilityVersion
        },
        requests_per_hour: formData.requests_per_hour,
        pricing: [{
          unit: formData.pricingUnit,
          quantity: formData.pricingQuantity
        }],
        legal: {},
        sellingWalletVkey: selectedWallet
      }
      console.log(details);
      await registerAgent(details, state.apiKey!);

      onSuccess();
    } catch (error) {
      console.error('Failed to register agent:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to register agent');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[660px]">
        <DialogHeader>
          <DialogTitle>Register New Agent</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">*Agent Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*API URL</label>
            <Input
              value={formData.api_url}
              onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
              required
              type="url"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Author Name</label>
            <Input
              value={formData.authorName}
              onChange={(e) => setFormData({ ...formData, authorName: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Author Contact</label>
            <Input
              value={formData.authorContact}
              onChange={(e) => setFormData({ ...formData, authorContact: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Author Organization</label>
            <Input
              value={formData.authorOrganization}
              onChange={(e) => setFormData({ ...formData, authorOrganization: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Capability Name</label>
            <Input
              value={formData.capabilityName}
              onChange={(e) => setFormData({ ...formData, capabilityName: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Capability Version</label>
            <Input
              value={formData.capabilityVersion}
              onChange={(e) => setFormData({ ...formData, capabilityVersion: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Requests per Hour</label>
            <Input
              value={formData.requests_per_hour}
              onChange={(e) => setFormData({ ...formData, requests_per_hour: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Pricing Unit</label>
            <Input
              value={formData.pricingUnit}
              onChange={(e) => setFormData({ ...formData, pricingUnit: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Pricing Quantity</label>
            <Input
              value={formData.pricingQuantity}
              onChange={(e) => setFormData({ ...formData, pricingQuantity: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input
              value={formData.tags.join(', ')}
              onChange={handleTagChange}
              placeholder="e.g., tag1, tag2"
              required
            />
            {tagError && <p className="text-red-500 text-sm">{tagError}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">*Select Selling Wallet</label>
            <Select value={selectedWallet} onValueChange={setSelectedWallet}>
              <SelectTrigger>
                <SelectValue placeholder="Select a wallet" />
              </SelectTrigger>
              <SelectContent>
                {sellingWallets.map((wallet, index) => (
                  <SelectItem key={index} value={wallet.walletVkey}>
                    {shortenAddress(wallet.collectionAddress)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Registering...' : 'Register Agent'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
} 