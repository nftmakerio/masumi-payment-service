interface UpdateApiKeyResponse {
  status: 'success' | 'error';
  message?: string;
}

interface UpdateApiKeyRequest {
  token: string;
  name?: string;
  description?: string;
  isActive?: boolean;
}

export async function updateApiKey(
  token: string,
  data: UpdateApiKeyRequest,
): Promise<UpdateApiKeyResponse> {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  if (!data.token) {
    throw new Error('API key must be provided');
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/api-key`,
      {
        method: 'PATCH',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          token: token,
        },
        body: JSON.stringify(data),
      },
    );

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to update API key');
    }

    return responseData;
  } catch (error: unknown) {
    console.error('Error updating API key:', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to update API key');
  }
}
