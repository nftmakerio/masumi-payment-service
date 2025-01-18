Configure the environment variables by copying the `.env.example` file to `.env`or `.env.local` and setup the
variables

- **DATABASE_URL**: The endpoint for a PostgreSQL database to be used
- **PORT**: The port to run the server on (default is 3001)
- **ENCRYPTION_KEY**: The key for encrypting the wallets in the database (Please see the [Security](#security)
  section for more details and security considerations)
- OPTIONAL: The services will run the following jobs whenever previous ones completed or after the provided
  time. (Defaults apply if not set)
  - **CHECK_WALLET_TRANSACTION_HASH_INTERVAL**: Cron expression for checking wallet transaction hash. This also
    reruns potentially effected services by unlocking the wallet
  - **BATCH_PAYMENT_INTERVAL**: Cron expression for batching requests
  - **CHECK_COLLECTION_INTERVAL**: Cron expression for checking collection
  - **CHECK_TX_INTERVAL**: Cron expression for checking payment
  - **CHECK_COLLECT_REFUND_INTERVAL**: Cron expression for checking collection and refund
  - **CHECK_REFUND_INTERVAL**: Cron expression for checking refund
  - **CHECK_DENY_INTERVAL**: Cron expression for checking deny

5. If you're setting up the database for the first time (or want to provide some initial data) you also need the
   following variables:

   - **BLOCKFROST_API_KEY**: An API Key from [https://blockfrost.io/](https://blockfrost.io/) for the correct blockchain
     network, you can create this for free
   - **NETWORK**: Currently supports PREVIEW (not recommended), PREPROD Cardano network or MAINNET
   - **ADMIN_KEY**: The key of the admin user, this key will have all permissions and can create new api_keys
   - **SMART CONTRACT DATA**: You can leave them the same as the example if you are using the default smart contract on
     the PREPROD network. Otherwise please refer to the smart contract documentation to find the correct values.

     - ADMIN Wallets are used to solve disputes (the default payment contract requires 2/3 independent admins to
       agree to resolve disputes).

       - **ADMIN_WALLET1_ADDRESS**: This should be the example address, if you use the public PREPROD test contract.
         Otherwise the first wallet address of the network admin.
       - **ADMIN_WALLET2_ADDRESS**: This is the second wallet address of the network admin. This should be the example
         address, if you use the public PREPROD test contract.
       - **ADMIN_WALLET3_ADDRESS**: This is the third wallet address of the network admin. This should be the example
         address, if you use the public PREPROD test contract.

     - The default payment contract will collect a fee to support the network.
       - **FEE_WALLET_ADDRESS**: This should be the example address, if you use the public PREPROD test contract.
         Otherwise the wallet address of the network that receives the fee. Please check the documentation of the
         payment contract you are using.
       - **FEE_PERMILLE**: The fee for the network in permille. This should be the example, if you use the public
         PREPROD test contract. Otherwise please check the documentation of the payment contract you are using.

   - OPTIONAL Wallet data: Used to configure payment and purchase wallets, if you want to use existing wallets
     - **PURCHASE_WALLET_MNEMONIC**: The mnemonic of the wallet used to purchase any agent requests. This needs to have
       sufficient funds to pay, or be topped up. If you do not provide a mnemonic, a new one will be generated. Please
       ensure you export them immediately after creation and store them securely.
     - **SELLING_WALLET_MNEMONIC**: The mnemonic of the wallet used to interact with the smart contract. This only needs
       minimal funds, to cover the CARDANO Network fees. If you do not provide a mnemonic, a new one will be
       generated. Please ensure you export them immediately after creation and store them securely.
     - **COLLECTION_WALLET_ADDRESS**: The wallet address of the collection wallet. It will receive all payments after
       a successful and completed purchase (not refund). It does not need any funds, however it is strongly recommended
       to create it via a hardware wallet or ensure its secret is stored securely. If you do not provide an address,
       the SELLING_WALLET will be used.
