import { Api, ContentType } from './generated/api';

export const apiClient = new Api({
    baseUrl: process.env.NEXT_PUBLIC_PAYMENT_API_BASE_URL,
    baseApiParams: {
        headers: {
            'Content-Type': ContentType.Json,
        },
    },
});

export const setAuthToken = (token: string) => {
    apiClient.setSecurityData(token);
};

export { Api }; 