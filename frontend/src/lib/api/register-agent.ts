export interface RegisterAgentPayload {
  network: string;
  paymentContractAddress: string;
  tags: string[];
  name: string;
  api_url: string;
  description: string;
  author: {
    name: string;
    contact?: string;
    organization?: string;
  };
  legal: {
    privacy_policy?: string;
    terms?: string;
    other?: string;
  };
  sellingWalletVkey: string;
  capability: {
    name: string;
    version: string;
  };
  requests_per_hour: string;
  pricing: {
    unit: string;
    quantity: string;
  }[];
}

export interface RegisterAgentResponse {
  status: string;
  data: {
    txHash: string;
    policyId: string;
    assetName: string;
    agentIdentifier: string;
  };
}

export async function registerAgent(
  payload: RegisterAgentPayload,
  token: string
): Promise<RegisterAgentResponse> {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/registry/`,
      {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
          'token': token
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to register agent');
    }

    return data;
  } catch (error) {
    console.error('Register agent failed:', error);
    throw error;
  }
} 