interface ApiKeyStatusResponse {
  status: 'success';
  data: {
    apiKey: string;
    permission: 'READ' | 'READ_PAY' | 'ADMIN';
    usageLimited: boolean;
    RemainingUsageCredits: {
      unit: string;
      amount: number | null;
    }[];
    status: 'ACTIVE' | 'REVOKED';
  };
}

export async function getApiKeyStatus(
  token: string,
): Promise<ApiKeyStatusResponse> {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/api-key-status/`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Token: token,
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        response.status === 401
          ? 'Invalid API key'
          : data.message || 'Failed to get API key status';
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    console.error('Error getting API key status:', error);
    throw error;
  }
}
