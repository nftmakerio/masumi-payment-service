
interface DeleteApiKeyResponse {
  status: 'success' | 'error';
  message?: string;
}

interface DeleteApiKeyRequest {
  apiKey: string;
}

export async function deleteApiKey(token: string, data: DeleteApiKeyRequest): Promise<DeleteApiKeyResponse> {
  if (!token) {
    throw new Error('Authorization token is required');
  }

  if (!data.apiKey) {
    throw new Error('API key must be provided');
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL}/api/v1/api-key/`,
      {
        method: 'DELETE',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
          'token': token
        },
        body: JSON.stringify({ apiKey: data.apiKey })
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.message || 'Failed to delete API key');
    }

    return responseData;
  } catch (error: unknown) {
    console.error('Error deleting API key:', error);
    throw error instanceof Error ? error : new Error('Failed to delete API key');
  }
}
