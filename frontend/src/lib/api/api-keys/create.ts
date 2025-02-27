interface CreateApiKeyResponse {
  status: 'success' | 'error';
  data?: {
    apiKey: string;
  };
  message?: string;
}

interface CreateApiKeyRequest {
  name: string;
  description?: string;
  usageLimited?: boolean;
  UsageCredits: {
    unit: string;
    amount: number;
  }[];
  permission?: 'READ' | 'READ_PAY' | 'ADMIN';
}

export async function createApiKey(
  token: string,
  data: CreateApiKeyRequest,
): Promise<CreateApiKeyResponse> {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/api-key/`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          token: token,
        },
        body: JSON.stringify({
          usageLimited: data.usageLimited,
          UsageCredits: data.UsageCredits,
          permission: data.permission,
        }),
      },
    );

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to create API key');
    }

    return responseData;
  } catch (error: unknown) {
    console.error('Error creating API key:', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to create API key');
  }
}
