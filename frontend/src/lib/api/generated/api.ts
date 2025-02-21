/* eslint-disable */
/* tslint:disable */
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, 'body' | 'bodyUsed'>;

export interface FullRequestParams extends Omit<RequestInit, 'body'> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<FullRequestParams, 'body' | 'method' | 'query' | 'path'>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, 'baseUrl' | 'cancelToken' | 'signal'>;
  securityWorker?: (securityData: SecurityDataType | null) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown> extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = 'application/json',
  FormData = 'multipart/form-data',
  UrlEncoded = 'application/x-www-form-urlencoded',
  Text = 'text/plain',
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = './../api/v1/';
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>['securityWorker'];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) => fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: 'same-origin',
    headers: {},
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === 'number' ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join('&');
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter((key) => 'undefined' !== typeof query[key]);
    return keys
      .map((key) => (Array.isArray(query[key]) ? this.addArrayQueryParam(query, key) : this.addQueryParam(query, key)))
      .join('&');
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : '';
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === 'object' || typeof input === 'string') ? JSON.stringify(input) : input,
    [ContentType.Text]: (input: any) => (input !== null && typeof input !== 'string' ? JSON.stringify(input) : input),
    [ContentType.FormData]: (input: any) =>
      Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === 'object' && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData()),
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(params1: RequestParams, params2?: RequestParams): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (cancelToken: CancelToken): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === 'boolean' ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(`${baseUrl || this.baseUrl || ''}${path}${queryString ? `?${queryString}` : ''}`, {
      ...requestParams,
      headers: {
        ...(requestParams.headers || {}),
        ...(type && type !== ContentType.FormData ? { 'Content-Type': type } : {}),
      },
      signal: (cancelToken ? this.createAbortSignal(cancelToken) : requestParams.signal) || null,
      body: typeof body === 'undefined' || body === null ? null : payloadFormatter(body),
    }).then(async (response) => {
      const r = response.clone() as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const data = !responseFormat
        ? r
        : await response[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title Template API
 * @version 1.0.0
 * @baseUrl ./../api/v1/
 *
 * This is the default API from a template
 */
export class Api<SecurityDataType extends unknown> extends HttpClient<SecurityDataType> {
  health = {
    /**
     * No description
     *
     * @tags health
     * @name HealthList
     * @summary Get the status of the API server
     * @request GET:/health/
     */
    healthList: (params: RequestParams = {}) =>
      this.request<
        {
          status: string;
        },
        any
      >({
        path: `/health/`,
        method: 'GET',
        format: 'json',
        ...params,
      }),
  };
  apiKeyStatus = {
    /**
     * @description Gets api key status
     *
     * @tags api-key-status
     * @name ApiKeyStatusList
     * @summary REQUIRES API KEY Authentication (+READ)
     * @request GET:/api-key-status/
     * @secure
     */
    apiKeyStatusList: (params: RequestParams = {}) =>
      this.request<
        {
          status: string;
          data: {
            apiKey: string;
            permission: 'READ' | 'READ_PAY' | 'ADMIN';
            usageLimited: boolean;
            RemainingUsageCredits: {
              unit: string;
              /**
               * @min 0
               * @max 100000000
               */
              amount: number | null;
            }[];
            status: 'ACTIVE' | 'REVOKED';
          };
        },
        any
      >({
        path: `/api-key-status/`,
        method: 'GET',
        secure: true,
        format: 'json',
        ...params,
      }),
  };
  wallet = {
    /**
     * @description Gets wallet status
     *
     * @tags wallet
     * @name WalletList
     * @summary REQUIRES API KEY Authentication (+ADMIN)
     * @request GET:/wallet/
     * @secure
     */
    walletList: (
      query: {
        /** The type of wallet to query */
        walletType: 'Selling' | 'Purchasing';
        /**
         * The id of the wallet to query
         * @minLength 1
         * @maxLength 250
         */
        id: string;
        /**
         * Whether to include the decrypted secret in the response
         * @default "false"
         */
        includeSecret?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            WalletSecret?: {
              createdAt: string;
              updatedAt: string;
              secret: string;
            };
            PendingTransaction: {
              createdAt: string;
              updatedAt: string;
              hash: string | null;
              lastCheckedAt: string | null;
            };
            note: string | null;
            walletVkey: string;
            walletAddress: string;
          };
        },
        any
      >({
        path: `/wallet/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),

    /**
     * @description Creates a wallet, it will not be saved in the database, please ensure to remember the mnemonic
     *
     * @tags wallet
     * @name WalletCreate
     * @summary REQUIRES API KEY Authentication (+ADMIN)
     * @request POST:/wallet/
     * @secure
     */
    walletCreate: (
      data: {
        /** The network the Cardano wallet will be used on */
        network: 'PREPROD' | 'MAINNET';
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          walletMnemonic: string;
          walletAddress: string;
          walletVkey: string;
        },
        any
      >({
        path: `/wallet/`,
        method: 'POST',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),
  };
  apiKey = {
    /**
     * @description Gets api key status
     *
     * @tags api-key
     * @name ApiKeyList
     * @summary REQUIRES API KEY Authentication (+admin)
     * @request GET:/api-key/
     * @secure
     */
    apiKeyList: (
      query?: {
        /**
         * The number of API keys to return
         * @min 1
         * @max 100
         * @default 10
         */
        limit?: number;
        /**
         * Used to paginate through the API keys
         * @maxLength 550
         */
        cursorApiKey?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            apiKeys: {
              apiKey: string;
              permission: 'READ' | 'READ_PAY' | 'ADMIN';
              usageLimited: boolean;
              RemainingUsageCredits: {
                unit: string;
                /** @min 0 */
                amount: number | null;
              }[];
              status: 'ACTIVE' | 'REVOKED';
            }[];
          };
        },
        void
      >({
        path: `/api-key/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),

    /**
     * @description Creates a API key
     *
     * @tags api-key
     * @name ApiKeyCreate
     * @summary REQUIRES API KEY Authentication (+admin)
     * @request POST:/api-key/
     * @secure
     */
    apiKeyCreate: (
      data: {
        /**
         * Whether the API key is usage limited. Meaning only allowed to use the specified credits or can freely spend
         * @default "true"
         */
        usageLimited?: string;
        /** The credits allowed to be used by the API key. Only relevant if usageLimited is true.  */
        UsageCredits: {
          /** @maxLength 150 */
          unit: string;
          /**
           * @min 0
           * @max 1000000
           */
          amount: number | null;
        }[];
        /**
         * The permission of the API key
         * @default "READ"
         */
        permission?: 'READ' | 'READ_PAY' | 'ADMIN';
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          data: {
            id: string;
            apiKey: string;
            permission: 'READ' | 'READ_PAY' | 'ADMIN';
            usageLimited: boolean;
            status: 'ACTIVE' | 'REVOKED';
          };
          status: string;
        },
        void
      >({
        path: `/api-key/`,
        method: 'POST',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),

    /**
     * @description Creates a API key
     *
     * @tags api-key
     * @name ApiKeyPartialUpdate
     * @summary REQUIRES API KEY Authentication (+admin)
     * @request PATCH:/api-key/
     * @secure
     */
    apiKeyPartialUpdate: (
      data: {
        /**
         * The id of the API key to update. Provide either id or apiKey
         * @maxLength 150
         */
        id?: string;
        /**
         * The API key to update. Provide either id or apiKey
         * @maxLength 550
         */
        apiKey?: string;
        /** The remaining credits allowed to be used by the API key. Only relevant if usageLimited is true.  */
        UsageCredits?: {
          /** @maxLength 150 */
          unit: string;
          /**
           * @min 0
           * @max 1000000
           */
          amount: number | null;
        }[];
        /**
         * The status of the API key
         * @default "ACTIVE"
         */
        status?: 'ACTIVE' | 'REVOKED';
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          data: {
            id: string;
            apiKey: string;
            permission: 'READ' | 'READ_PAY' | 'ADMIN';
            usageLimited: boolean;
            status: 'ACTIVE' | 'REVOKED';
          };
          status: string;
        },
        void
      >({
        path: `/api-key/`,
        method: 'PATCH',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),

    /**
     * @description Removes a API key
     *
     * @tags api-key
     * @name ApiKeyDelete
     * @summary REQUIRES API KEY Authentication (+admin)
     * @request DELETE:/api-key/
     * @secure
     */
    apiKeyDelete: (
      data: {
        /**
         * The id of the API key to delete. Provide either id or apiKey
         * @maxLength 150
         */
        id?: string;
        /**
         * The API key to delete. Provide either id or apiKey
         * @maxLength 550
         */
        apiKey?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          data: {
            id: string;
            apiKey: string;
          };
          status: string;
        },
        void
      >({
        path: `/api-key/`,
        method: 'DELETE',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),
  };
  payment = {
    /**
     * @description Gets the payment status. It needs to be created first with a POST request.
     *
     * @tags payment
     * @name PaymentList
     * @summary REQUIRES API KEY Authentication (+READ)
     * @request GET:/payment/
     * @secure
     */
    paymentList: (
      query: {
        /**
         * The number of payments to return
         * @min 1
         * @max 100
         * @default 10
         */
        limit?: number;
        /** Used to paginate through the payments. If this is provided, cursorId is required */
        cursorId?: string;
        /** The network the payments were made on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The address of the smart contract where the payments were made to
         * @maxLength 250
         */
        paymentContractAddress?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            payments: {
              id: string;
              createdAt: string;
              updatedAt: string;
              status:
                | 'PaymentRequested'
                | 'PaymentConfirmed'
                | 'PaymentInvalid'
                | 'ResultGenerated'
                | 'CompletedInitiated'
                | 'CompletedConfirmed'
                | 'Denied'
                | 'RefundRequested'
                | 'Refunded'
                | 'WithdrawnInitiated'
                | 'WithdrawnConfirmed'
                | 'DisputedWithdrawn';
              txHash: string | null;
              utxo: string | null;
              errorType: 'NETWORK_ERROR' | 'UNKNOWN' | null;
              errorNote: string | null;
              errorRequiresManualReview: boolean | null;
              blockchainIdentifier: string;
              SmartContractWallet: {
                id: string;
                walletAddress: string;
                walletVkey: string;
                note: string | null;
              };
              BuyerWallet: {
                walletVkey: string;
              } | null;
              Amounts: {
                id: string;
                createdAt: string;
                updatedAt: string;
                /** @min 0 */
                amount: number | null;
                unit: string;
              }[];
              NetworkHandler: {
                id: string;
                network: 'PREPROD' | 'MAINNET';
                paymentContractAddress: string;
                paymentType: 'WEB3_CARDANO_V1';
              };
            }[];
          };
        },
        void
      >({
        path: `/payment/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),

    /**
     * @description Creates a payment request and identifier. This will check incoming payments in the background.
     *
     * @tags payment
     * @name PaymentCreate
     * @summary REQUIRES API KEY Authentication (+PAY)
     * @request POST:/payment/
     * @secure
     */
    paymentCreate: (
      data: {
        /** The network the payment will be received on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The identifier of the agent that will be paid
         * @minLength 15
         * @maxLength 250
         */
        agentIdentifier: string;
        /**
         * The amounts of the payment
         * @maxItems 7
         */
        amounts: {
          /**
           * @min 0
           * @max 9007199254740991
           */
          amount: number | null;
          unit: string;
        }[];
        /** The type of payment contract used */
        paymentType: 'WEB3_CARDANO_V1';
        /**
         * The address of the smart contract where the payment will be made to
         * @maxLength 250
         */
        paymentContractAddress?: string;
        /**
         * The time after which the payment has to be submitted to the smart contract
         * @default "2025-02-09T14:57:08.497Z"
         */
        submitResultTime?: string;
        /** The time after which the payment will be unlocked */
        unlockTime?: string;
        /** The time after which a refund will be approved */
        refundTime?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          data: {
            id: string;
            createdAt: string;
            updatedAt: string;
            status:
              | 'PaymentRequested'
              | 'PaymentConfirmed'
              | 'PaymentInvalid'
              | 'ResultGenerated'
              | 'CompletedInitiated'
              | 'CompletedConfirmed'
              | 'Denied'
              | 'RefundRequested'
              | 'Refunded'
              | 'WithdrawnInitiated'
              | 'WithdrawnConfirmed'
              | 'DisputedWithdrawn';
            txHash: string | null;
            utxo: string | null;
            errorType: 'NETWORK_ERROR' | 'UNKNOWN' | null;
            errorNote: string | null;
            errorRequiresManualReview: boolean | null;
            blockchainIdentifier: string;
            unlockTime: number;
            refundTime: number;
            submitResultTime: number;
            Amounts: {
              id: string;
              createdAt: string;
              updatedAt: string;
              /** @min 0 */
              amount: number | null;
              unit: string;
            }[];
            SmartContractWallet: {
              id: string;
              walletAddress: string;
              walletVkey: string;
              note: string | null;
            };
            BuyerWallet: {
              walletVkey: string;
            } | null;
            NetworkHandler: {
              id: string;
              network: 'PREPROD' | 'MAINNET';
              paymentContractAddress: string;
              paymentType: 'WEB3_CARDANO_V1';
            };
          };
          status: string;
        },
        void
      >({
        path: `/payment/`,
        method: 'POST',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),

    /**
     * @description Completes a payment request. This will collect the funds after the unlock time.
     *
     * @tags payment
     * @name PaymentPartialUpdate
     * @summary REQUIRES API KEY Authentication (+PAY)
     * @request PATCH:/payment/
     * @secure
     */
    paymentPartialUpdate: (
      data: {
        /** The network the payment was received on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The address of the smart contract where the payment was made to
         * @maxLength 250
         */
        paymentContractAddress?: string;
        /**
         * The hash of the AI agent result to be submitted
         * @maxLength 250
         */
        hash: string;
        /**
         * The identifier of the payment
         * @maxLength 250
         */
        identifier: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          data: {
            id: string;
            createdAt: string;
            updatedAt: string;
            status:
              | 'PaymentRequested'
              | 'PaymentConfirmed'
              | 'PaymentInvalid'
              | 'ResultGenerated'
              | 'CompletedInitiated'
              | 'CompletedConfirmed'
              | 'Denied'
              | 'RefundRequested'
              | 'Refunded'
              | 'WithdrawnInitiated'
              | 'WithdrawnConfirmed'
              | 'DisputedWithdrawn';
          };
          status: string;
        },
        void
      >({
        path: `/payment/`,
        method: 'PATCH',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),
  };
  purchase = {
    /**
     * @description Gets the purchase status. It needs to be created first with a POST request.
     *
     * @tags purchase
     * @name PurchaseList
     * @summary REQUIRES API KEY Authentication (+READ)
     * @request GET:/purchase/
     * @secure
     */
    purchaseList: (
      query: {
        /**
         * The number of purchases to return
         * @min 1
         * @max 100
         * @default 10
         */
        limit?: number;
        /** Used to paginate through the purchases. If this is provided, cursorId is required */
        cursorId?: string;
        /** The network the purchases were made on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The address of the smart contract where the purchases were made to
         * @maxLength 250
         */
        paymentContractAddress?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            purchases: {
              id: string;
              createdAt: string;
              updatedAt: string;
              status:
                | 'PurchaseRequested'
                | 'PurchaseInitiated'
                | 'PurchaseConfirmed'
                | 'Completed'
                | 'RefundRequestInitiated'
                | 'RefundRequestConfirmed'
                | 'RefundInitiated'
                | 'RefundConfirmed'
                | 'RefundRequestCanceledInitiated'
                | 'Withdrawn'
                | 'DisputedWithdrawn';
              txHash: string | null;
              utxo: string | null;
              errorType: 'NETWORK_ERROR' | 'INSUFFICIENT_FUNDS' | 'UNKNOWN' | null;
              errorNote: string | null;
              errorRequiresManualReview: boolean | null;
              blockchainIdentifier: string;
              SmartContractWallet: {
                id: string;
                walletAddress: string;
                walletVkey: string;
                note: string | null;
              };
              SellerWallet: {
                walletVkey: string;
                note: string | null;
              };
              Amounts: {
                id: string;
                createdAt: string;
                updatedAt: string;
                /** @min 0 */
                amount: number | null;
                unit: string;
              }[];
              NetworkHandler: {
                id: string;
                network: 'PREPROD' | 'MAINNET';
                paymentContractAddress: string;
                paymentType: 'WEB3_CARDANO_V1';
              } | null;
            }[];
          };
        },
        void
      >({
        path: `/purchase/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),

    /**
     * @description Creates a purchase and pays the seller. This requires funds to be available.
     *
     * @tags purchase
     * @name PurchaseCreate
     * @summary REQUIRES API KEY Authentication (+PAY)
     * @request POST:/purchase/
     * @secure
     */
    purchaseCreate: (
      data: {
        id: string;
        /**
         * The identifier of the purchase. Is provided by the seller
         * @maxLength 250
         */
        blockchainIdentifier: string;
        /** The network the transaction will be made on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The verification key of the seller
         * @maxLength 250
         */
        sellerVkey: string;
        /**
         * The address of the smart contract where the purchase will be made to
         * @maxLength 250
         */
        paymentContractAddress?: string;
        /**
         * The amounts of the purchase
         * @maxItems 7
         */
        amounts: {
          /**
           * @min 0
           * @max 9007199254740991
           */
          amount: number | null;
          unit: string;
        }[];
        /** The payment type of smart contract used */
        paymentType: 'WEB3_CARDANO_V1';
        /** The time after which the purchase will be unlocked. In unix time (number) */
        unlockTime: number | null;
        /** The time after which a refund will be approved. In unix time (number) */
        refundTime: number | null;
        /** The time by which the result has to be submitted. In unix time (number) */
        submitResultTime: number | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          data: {
            id: string;
            createdAt: string;
            updatedAt: string;
            status:
              | 'PurchaseRequested'
              | 'PurchaseInitiated'
              | 'PurchaseConfirmed'
              | 'Completed'
              | 'RefundRequestInitiated'
              | 'RefundRequestConfirmed'
              | 'RefundInitiated'
              | 'RefundConfirmed'
              | 'RefundRequestCanceledInitiated'
              | 'Withdrawn'
              | 'DisputedWithdrawn';
          };
          status: string;
        },
        void
      >({
        path: `/purchase/`,
        method: 'POST',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),

    /**
     * @description Requests a refund for a completed purchase. This will collect the refund after the refund time.
     *
     * @tags purchase
     * @name PurchasePartialUpdate
     * @summary REQUIRES API KEY Authentication (+PAY)
     * @request PATCH:/purchase/
     * @secure
     */
    purchasePartialUpdate: (
      data: {
        id: string;
        /**
         * The identifier of the purchase to be refunded
         * @maxLength 250
         */
        blockchainIdentifier: string;
        /** The network the Cardano wallet will be used on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The address of the smart contract holding the purchase
         * @maxLength 250
         */
        paymentContractAddress?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          data: {
            txHash: string;
          };
          status: string;
        },
        void
      >({
        path: `/purchase/`,
        method: 'PATCH',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),
  };
  registry = {
    /**
     * @description Gets the agent metadata.
     *
     * @tags registry
     * @name RegistryList
     * @summary REQUIRES API KEY Authentication (+READ)
     * @request GET:/registry/
     * @secure
     */
    registryList: (
      query: {
        /**
         * The payment key of the wallet to be queried
         * @maxLength 250
         */
        walletVKey: string;
        /** The Cardano network used to register the agent on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The smart contract address of the payment contract to which the registration belongs
         * @maxLength 250
         */
        paymentContractAddress?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            assets: {
              /** @maxLength 250 */
              unit: string;
              metadata: {
                /** @maxLength 250 */
                name: string;
                /** @maxLength 250 */
                description?: string | null;
                /** @maxLength 250 */
                api_url: string;
                /** @maxLength 250 */
                example_output?: string | null;
                tags: string[];
                /** @maxLength 250 */
                requests_per_hour?: string | null;
                capability: {
                  /** @maxLength 250 */
                  name: string;
                  /** @maxLength 250 */
                  version: string;
                };
                author: {
                  /** @maxLength 250 */
                  name: string;
                  /** @maxLength 250 */
                  contact?: string | null;
                  /** @maxLength 250 */
                  organization?: string | null;
                };
                legal?: {
                  /** @maxLength 250 */
                  privacy_policy?: string | null;
                  /** @maxLength 250 */
                  terms?: string | null;
                  /** @maxLength 250 */
                  other?: string | null;
                };
                /** @minItems 1 */
                pricing: {
                  /** @min 1 */
                  quantity: number;
                  /** @maxLength 250 */
                  unit: string;
                }[];
                /** @maxLength 250 */
                image: string;
                /**
                 * @min 1
                 * @max 1
                 */
                metadata_version: number;
              };
            }[];
          };
        },
        any
      >({
        path: `/registry/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),

    /**
     * @description Registers an agent to the registry.
     *
     * @tags registry
     * @name RegistryCreate
     * @summary REQUIRES API KEY Authentication (+PAY)
     * @request POST:/registry/
     * @secure
     */
    registryCreate: (
      data: {
        /** The Cardano network used to register the agent on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The smart contract address of the payment contract to be registered for
         * @maxLength 250
         */
        paymentContractAddress?: string;
        /**
         * The payment key of a specific wallet used for the registration
         * @maxLength 250
         */
        sellingWalletVkey?: string;
        /**
         * Link to a example output of the agent
         * @maxLength 250
         */
        example_output?: string;
        /**
         * Tags used in the registry metadata
         * @maxItems 15
         * @minItems 1
         */
        tags: string[];
        /**
         * Name of the agent
         * @maxLength 250
         */
        name: string;
        /**
         * Base URL of the agent, to request interactions
         * @maxLength 250
         */
        api_url: string;
        /**
         * Description of the agent
         * @maxLength 250
         */
        description: string;
        /** Provide information about the used AI model and version */
        capability: {
          /** @maxLength 250 */
          name: string;
          /** @maxLength 250 */
          version: string;
        };
        /**
         * The request the agent can handle per hour
         * @maxLength 250
         */
        requests_per_hour: string;
        /**
         * Price for a default interaction
         * @maxItems 5
         */
        pricing: {
          /** @maxLength 250 */
          unit: string;
          /** @maxLength 55 */
          quantity: string;
        }[];
        /** Legal information about the agent */
        legal?: {
          /** @maxLength 250 */
          privacy_policy?: string;
          /** @maxLength 250 */
          terms?: string;
          /** @maxLength 250 */
          other?: string;
        };
        /** Author information about the agent */
        author: {
          /** @maxLength 250 */
          name: string;
          /** @maxLength 250 */
          contact?: string;
          /** @maxLength 250 */
          organization?: string;
        };
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            txHash: string;
          };
        },
        any
      >({
        path: `/registry/`,
        method: 'POST',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),

    /**
     * @description Deregisters a agent from the specified registry.
     *
     * @tags registry
     * @name RegistryDelete
     * @summary REQUIRES API KEY Authentication (+PAY)
     * @request DELETE:/registry/
     * @secure
     */
    registryDelete: (
      query: {
        /**
         * The identifier of the registration (asset) to be deregistered
         * @maxLength 250
         */
        assetName: string;
        /** The network the registration was made on */
        network: 'PREPROD' | 'MAINNET';
        /**
         * The smart contract address of the payment contract to which the registration belongs
         * @maxLength 250
         */
        paymentContractAddress?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            txHash: string;
          };
        },
        any
      >({
        path: `/registry/`,
        method: 'DELETE',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),
  };
  paymentContract = {
    /**
     * @description Gets the payment contract.
     *
     * @tags payment-contract
     * @name PaymentContractList
     * @summary REQUIRES API KEY Authentication (+READ)
     * @request GET:/payment-contract/
     * @secure
     */
    paymentContractList: (
      query?: {
        /**
         * The number of payment sources to return
         * @min 1
         * @max 100
         * @default 10
         */
        take?: number;
        /**
         * Used to paginate through the payment sources
         * @maxLength 250
         */
        cursorId?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            paymentSources: {
              id: string;
              createdAt: string;
              updatedAt: string;
              network: 'PREPROD' | 'MAINNET';
              paymentContractAddress: string;
              paymentType: 'WEB3_CARDANO_V1';
              lastIdentifierChecked: string | null;
              lastPageChecked: number;
              lastCheckedAt: string | null;
              AdminWallets: {
                walletAddress: string;
                order: number;
              }[];
              CollectionWallet: {
                id: string;
                walletAddress: string;
                note: string | null;
              };
              PurchasingWallets: {
                id: string;
                walletVkey: string;
                walletAddress: string;
                note: string | null;
              }[];
              SellingWallets: {
                id: string;
                walletVkey: string;
                walletAddress: string;
                note: string | null;
              }[];
              FeeReceiverNetworkWallet: {
                walletAddress: string;
              };
              /**
               * @min 0
               * @max 1000
               */
              feePermille: number;
            }[];
          };
        },
        any
      >({
        path: `/payment-contract/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),
  };
  paymentSource = {
    /**
     * @description Gets the payment sources including the status.
     *
     * @tags payment-source
     * @name PaymentSourceList
     * @summary REQUIRES API KEY Authentication (+ADMIN)
     * @request GET:/payment-source/
     * @secure
     */
    paymentSourceList: (
      query?: {
        /**
         * The number of payment sources to return
         * @min 1
         * @max 100
         * @default 10
         */
        take?: number;
        /**
         * Used to paginate through the payment sources
         * @maxLength 250
         */
        cursorId?: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            paymentSources: {
              id: string;
              createdAt: string;
              updatedAt: string;
              network: 'PREPROD' | 'MAINNET';
              paymentContractAddress: string;
              paymentType: 'WEB3_CARDANO_V1';
              rpcProviderApiKey: string;
              lastIdentifierChecked: string | null;
              isSyncing: boolean;
              lastPageChecked: number;
              lastCheckedAt: string | null;
              AdminWallets: {
                walletAddress: string;
                order: number;
              }[];
              CollectionWallet: {
                id: string;
                walletAddress: string;
                note: string | null;
              };
              PurchasingWallets: {
                id: string;
                walletVkey: string;
                walletAddress: string;
                note: string | null;
              }[];
              SellingWallets: {
                id: string;
                walletVkey: string;
                walletAddress: string;
                note: string | null;
              }[];
              FeeReceiverNetworkWallet: {
                walletAddress: string;
              };
              /**
               * @min 0
               * @max 1000
               */
              feePermille: number;
            }[];
          };
        },
        any
      >({
        path: `/payment-source/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),

    /**
     * @description Creates a payment source.
     *
     * @tags payment-source
     * @name PaymentSourceCreate
     * @summary REQUIRES API KEY Authentication (+ADMIN)
     * @request POST:/payment-source/
     * @secure
     */
    paymentSourceCreate: (
      data: {
        /** The network the payment source will be used on */
        network: 'PREPROD' | 'MAINNET';
        /** The type of payment contract used */
        paymentType: 'WEB3_CARDANO_V1';
        /**
         * The rpc provider (blockfrost) api key to be used for the payment source
         * @maxLength 250
         */
        rpcProviderApiKey: string;
        /**
         * The fee in permille to be used for the payment source. The default contract uses 50 (5%)
         * @min 0
         * @max 1000
         */
        feePermille: number | null;
        /**
         * The wallet addresses of the admin wallets (exactly 3)
         * @maxItems 3
         * @minItems 3
         */
        AdminWallets: {
          /** @maxLength 250 */
          walletAddress: string;
        }[];
        /** The wallet address of the network fee receiver wallet */
        FeeReceiverNetworkWallet: {
          /** @maxLength 250 */
          walletAddress: string;
        };
        /** The wallet address and note of the collection wallet (ideally a hardware wallet). Please backup the mnemonic of the wallet. */
        CollectionWallet: {
          /** @maxLength 250 */
          walletAddress: string;
          /** @maxLength 250 */
          note: string;
        };
        /**
         * The mnemonic of the purchasing wallets to be added. Please backup the mnemonic of the wallets.
         * @maxItems 50
         * @minItems 1
         */
        PurchasingWallets: {
          /** @maxLength 1500 */
          walletMnemonic: string;
          /** @maxLength 250 */
          note: string;
        }[];
        /**
         * The mnemonic of the selling wallets to be added. Please backup the mnemonic of the wallets.
         * @maxItems 50
         * @minItems 1
         */
        SellingWallets: {
          /** @maxLength 1500 */
          walletMnemonic: string;
          /** @maxLength 250 */
          note: string;
        }[];
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            id: string;
            createdAt: string;
            updatedAt: string;
            network: 'PREPROD' | 'MAINNET';
            paymentContractAddress: string;
            paymentType: 'WEB3_CARDANO_V1';
            rpcProviderApiKey: string;
            isSyncing: boolean;
            lastIdentifierChecked: string | null;
            lastPageChecked: number;
            lastCheckedAt: string | null;
          };
        },
        any
      >({
        path: `/payment-source/`,
        method: 'POST',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),

    /**
     * @description Creates a payment source.
     *
     * @tags payment-source
     * @name PaymentSourcePartialUpdate
     * @summary REQUIRES API KEY Authentication (+ADMIN)
     * @request PATCH:/payment-source/
     * @secure
     */
    paymentSourcePartialUpdate: (
      data: {
        /**
         * The id of the payment source to be updated
         * @maxLength 250
         */
        id: string;
        /**
         * The rpc provider (blockfrost) api key to be used for the payment source
         * @maxLength 250
         */
        rpcProviderApiKey?: string;
        /** The wallet address and note of the collection wallet (ideally a hardware wallet). Usually should not be changed. Please backup the mnemonic of the old wallet before changing it. */
        CollectionWallet?: {
          /** @maxLength 250 */
          walletAddress: string;
          /** @maxLength 250 */
          note: string;
        };
        /**
         * The mnemonic of the purchasing wallets to be added
         * @maxItems 10
         * @minItems 1
         */
        AddPurchasingWallets?: {
          /** @maxLength 1500 */
          walletMnemonic: string;
          /** @maxLength 250 */
          note: string;
        }[];
        /**
         * The mnemonic of the selling wallets to be added
         * @maxItems 10
         * @minItems 1
         */
        AddSellingWallets?: {
          /** @maxLength 1500 */
          walletMnemonic: string;
          /** @maxLength 250 */
          note: string;
        }[];
        /**
         * The ids of the purchasing wallets to be removed. Please backup the mnemonic of the old wallet before removing it.
         * @maxItems 10
         */
        RemovePurchasingWallets?: {
          id: string;
        }[];
        /**
         * The ids of the selling wallets to be removed. Please backup the mnemonic of the old wallet before removing it.
         * @maxItems 10
         */
        RemoveSellingWallets?: {
          id: string;
        }[];
        /**
         * The page number of the payment source. Usually should not be changed
         * @min 1
         * @max 100000000
         */
        lastPageChecked?: number;
        /**
         * The latest identifier of the payment source. Usually should not be changed
         * @maxLength 250
         */
        lastIdentifierChecked?: string | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            id: string;
            createdAt: string;
            updatedAt: string;
            network: 'PREPROD' | 'MAINNET';
            paymentContractAddress: string;
            paymentType: 'WEB3_CARDANO_V1';
            rpcProviderApiKey: string;
            isSyncing: boolean;
            lastIdentifierChecked: string | null;
            lastPageChecked: number;
            lastCheckedAt: string | null;
          };
        },
        any
      >({
        path: `/payment-source/`,
        method: 'PATCH',
        body: data,
        secure: true,
        type: ContentType.Json,
        format: 'json',
        ...params,
      }),

    /**
     * @description Deletes a payment source. WARNING will also delete all associated wallets and transactions.
     *
     * @tags payment-source
     * @name PaymentSourceDelete
     * @summary REQUIRES API KEY Authentication (+ADMIN)
     * @request DELETE:/payment-source/
     * @secure
     */
    paymentSourceDelete: (
      query: {
        /** The id of the payment source to be deleted */
        id: string;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          status: string;
          data: {
            id: string;
          };
        },
        any
      >({
        path: `/payment-source/`,
        method: 'DELETE',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),
  };
  utxos = {
    /**
     * @description Gets UTXOs (internal)
     *
     * @tags utxos
     * @name UtxosList
     * @summary REQUIRES API KEY Authentication (+READ)
     * @request GET:/utxos/
     * @secure
     */
    utxosList: (
      query: {
        /**
         * The address to get the UTXOs for
         * @maxLength 150
         */
        address: string;
        network: 'PREPROD' | 'MAINNET';
        /**
         * The number of UTXOs to get
         * @min 1
         * @max 100
         * @default 10
         */
        count?: number;
        /**
         * The page number to get
         * @min 1
         * @max 100
         * @default 1
         */
        page?: number;
        /**
         * The order to get the UTXOs in
         * @default "desc"
         */
        order?: 'asc' | 'desc';
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          utxos: {
            txHash: string;
            address: string;
            amount: {
              unit: string;
              /**
               * @min 0
               * @max 10000000000
               */
              quantity: number | null;
            }[];
            data_hash?: string;
            inline_datum?: string;
            reference_script_hash?: string;
            /**
             * @min 0
             * @max 1000000000
             */
            output_index: number | null;
            block: string;
          }[];
        },
        any
      >({
        path: `/utxos/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),
  };
  rpcApiKeys = {
    /**
     * @description Gets rpc api keys, currently only blockfrost is supported (internal)
     *
     * @tags rpc-api-keys
     * @name RpcApiKeysList
     * @summary REQUIRES API KEY Authentication (+ADMIN)
     * @request GET:/rpc-api-keys/
     * @secure
     */
    rpcApiKeysList: (
      query?: {
        /**
         * Used to paginate through the rpc provider keys
         * @minLength 1
         * @maxLength 250
         */
        cursorId?: string;
        /**
         * The number of rpc provider keys to return
         * @min 1
         * @max 100
         * @default 100
         */
        limit?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<
        {
          rpcProviderKeys: {
            id: string;
            rpcProviderApiKey: string;
            createdAt: string;
            updatedAt: string;
            network: 'PREPROD' | 'MAINNET';
          }[];
        },
        any
      >({
        path: `/rpc-api-keys/`,
        method: 'GET',
        query: query,
        secure: true,
        format: 'json',
        ...params,
      }),
  };
}
