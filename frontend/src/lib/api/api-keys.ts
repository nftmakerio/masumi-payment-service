interface ApiKey {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  apiKey: string;
  permission: "ADMIN" | "USER";
  usageLimited: boolean;
  status: "ACTIVE" | "INACTIVE";
  RemainingUsageCredits?: {
    unit: string;
    amount: number;
  }[];
}

interface ListApiKeysResponse {
  status: 'success' | 'error';
  keys?: ApiKey[];
  message?: string;
}

interface ListApiKeysOptions {
  limit?: number;
  cursorApiKey?: string;
}

export async function listApiKeys(token: string, options: ListApiKeysOptions = {}): Promise<ListApiKeysResponse> {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  try {
    const { limit = 10, cursorApiKey } = options;
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      ...(cursorApiKey && { cursorApiKey: cursorApiKey.toString() })
    }).toString();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/api-key/?${queryParams}`,
      {
        headers: {
          'accept': 'application/json',
          'token': token
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch API keys');
    }

    return {
      status: 'success',
      keys: data.data.apiKeys
    };
  } catch (error) {
    console.error('Error fetching API keys:', error);
    throw error instanceof Error ? error : new Error('Failed to fetch API keys');
  }
}
