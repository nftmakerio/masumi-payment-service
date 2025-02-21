interface GetWalletResponse {
    status: 'success' | 'error';
    ada: number;
    usdm: number;
}

interface GetWalletOptions {
    walletAddress: string;
    network: string;
    blockfrostApiKey: string;
}

interface BlockfrostAsset {
    unit: string;
    quantity: string;
}

interface BlockfrostAddressResponse {
    amount: BlockfrostAsset[];
}

export async function getWalletBalance(token: string, options: GetWalletOptions): Promise<GetWalletResponse> {
    if (!token) {
        throw new Error('Authorization token is required');
    }

    if (!options.blockfrostApiKey) {
        throw new Error('Blockfrost API key is required');
    }

    try {
        const networkUrl = options.network.toLowerCase() === 'mainnet' 
            ? 'https://cardano-mainnet.blockfrost.io/api/v0'
            : 'https://cardano-preprod.blockfrost.io/api/v0';

        const response = await fetch(`${networkUrl}/addresses/${options.walletAddress}`, {
            headers: {
                'project_id': options.blockfrostApiKey
            }
        });

        if (response.status === 404) {
            return {
                ada: 0,
                usdm: 0,
                status: 'success'
            };
        }

        if (!response.ok) {
            throw new Error(`Blockfrost API request failed with status ${response.status}: ${await response.text()}`);
        }

        const data = await response.json() as BlockfrostAddressResponse;
        const usdmPolicyId = "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad";
        const usdmHex = "0014df105553444d";

        const balanceAda = parseInt(data.amount[0]?.quantity || '0');

        const balanceUsdm = data.amount.reduce((total: number, asset: BlockfrostAsset) => {
            if (asset.unit?.startsWith(usdmPolicyId + usdmHex)) {
                return total + parseInt(asset.quantity || '0');
            }
            return total;
        }, 0);

        return {
            ada: balanceAda / 1000000,
            usdm: balanceUsdm / 10000000,
            status: 'success'
        };
    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        throw error instanceof Error ? error : new Error('Failed to fetch wallet balance');
    }
}
