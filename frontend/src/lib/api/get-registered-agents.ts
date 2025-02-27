export interface GetRegisteredAgentsResponse {
  status: string;
  data: {
    assets: {
      policyId: string;
      assetName: string;
      agentIdentifier: string;
      metadata: {
        name: string;
        description: string;
        api_url: string;
        example_output: string;
        tags: string[];
        capability: {
          name: string;
          version: string;
        };
        author: {
          name: string;
          contact: string;
          organization: string;
        };
        legal: {
          privacy_policy: string;
          terms: string;
          other: string;
        };
        image: string;
        pricing: {
          quantity: number;
          unit: string;
        }[];
        metadata_version: number;
      };
    }[];
    hasMore: boolean;
    nextCursor?: string;
  };
}

export async function getRegisteredAgents(
  token: string,
  limit = 10,
  cursor?: string,
  walletVKey?: string,
  network?: string,
  paymentContractAddress?: string,
): Promise<GetRegisteredAgentsResponse> {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  try {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      ...(cursor && { cursor }),
      ...(walletVKey && { walletVKey }),
      ...(network && { network }),
      ...(paymentContractAddress && { paymentContractAddress }),
    });

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/registry/?${queryParams}`,
      {
        headers: {
          accept: 'application/json',
          token: token,
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch registered agents');
    }

    return data;
  } catch (error) {
    console.error('Failed to fetch registered agents:', error);
    throw error;
  }
}
