# Masumi Payment Service

## Goals

The goal is to provide an easy to use service to handle all things decentralized payments for the agents.
It currently supports a REST full API that provides various functionality.

Furthermore it supports generation of wallets and checks for incoming payments periodically.

## Project Architecture and Technology Stack

This section provides an overview of the key architectural patterns and technologies employed in our backend:

Our backend architecture is built upon the following design patterns and powerful libraries:

## Related Repositories

- [Masumi Registry](https://github.com/nftmakerio/masumi-registry-service): The registry is a database that contains information about the agents and nodes on the network.

## Project Architecture and Technology Stack

This section provides an overview of the key architectural patterns and technologies used in this service:

- [Express-Zod-Api](https://www.npmjs.com/package/express-zod-api): Utilized as the framework for implementing our RESTful API with Swagger UI. The library uses:
  - [Express](http://expressjs.com/) as the framework for implementing our RESTful API
  - [Zod](https://www.npmjs.com/package/zod) for request validation
- [Prisma](https://www.prisma.io/): Implemented as the ORM to interact with our PostgreSQL database
- [DOTENV](https://www.npmjs.com/package/dotenv): Incorporated to securely load environment variables from `.env` files
- [Zod-to-OpenAPI](https://www.npmjs.com/package/@asteasolutions/zod-to-openapi): Used to generate the OpenAPI schema from the Zod schemas
- [Blockfrost](https://www.npmjs.com/package/@blockfrost/blockfrost-js): Used to interact with the Cardano blockchain
- [Jest](https://jestjs.io/): Used as the testing framework
- [Docker](https://www.docker.com/): Used to containerize the application for production

## Install

1. Install [node.js](https://nodejs.org/en/download/) in version 18.x
2. Clone this repository, and using a terminal navigate to its directory.
3. Run `npm install` to install the dependencies.
4. Configure the environment variables by copying the `.env.example` file to `.env`or `.env.local` and setup the variables

   - DATABASE_URL: The endpoint for a PostgreSQL database to be used
   - PORT: The port to run the server on (default is 3001)
   - ENCRYPTION_KEY: The key for encrypting the wallets in the database (Please see the [Security](#security) section for more details and security considerations)
   - OPTIONALLY: The services will run the following jobs whenever previous ones completed or after the provided time. (Defaults apply if not set)
     - CHECK_WALLET_TRANSACTION_HASH_INTERVAL: Cron expression for checking wallet transaction hash. This also reruns potentially effected services by unlocking the wallet
     - BATCH_PAYMENT_INTERVAL: Cron expression for batching requests
     - CHECK_COLLECTION_INTERVAL: Cron expression for checking collection
     - CHECK_TX_INTERVAL: Cron expression for checking payment
     - CHECK_COLLECT_REFUND_INTERVAL: Cron expression for checking collection and refund
     - CHECK_REFUND_INTERVAL: Cron expression for checking refund
     - CHECK_DENY_INTERVAL: Cron expression for checking deny

5. If you're setting up the database for the first time (or want to provide some initial data) you also need the following variables:

   - BLOCKFROST_API_KEY: An API Key from [https://blockfrost.io/](https://blockfrost.io/) for the correct blockchain network, you can create this for free
   - NETWORK: Currently supports PREVIEW (not recommended), PREPROD Cardano network or MAINNET
   - ADMIN_KEY: The key of the admin user, this key will have all permissions and can create new api_keys
   - SMART CONTRACT DATA: You can leave them the same as the example if you are using the default smart contract on the PREPROD network. Otherwise please refer to the smart contract documentation to find the correct values.

     - ADMIN Wallets are used to solve disputes (the default payment contract requires 2/3 independent admins to agree to resolve disputes).

       - ADMIN_WALLET1_ADDRESS="addr_test1qrgpga399l0r8fg7n0jfshhxsjl26w0uslxf5m02yclur8mremst4rk8xsz9lx78e9sdtjfsyj3c9kll2c4958uhkals2qrm9q" # This should be the example address, if you use the public PREPROD test contract. Otherwise the first wallet address of the network admin.
       - ADMIN_WALLET2_ADDRESS="addr_test1qqturqflellkrv0kcg9guuzkk8wx5yaytpsfcd3mmvemg0v7akaxvzel56ls59kw2fs20ckxhs09365medeen6tyy0pqkx3hku" #This is the second wallet address of the network admin. This should be the example address, if you use the public PREPROD test contract.
       - ADMIN_WALLET3_ADDRESS="addr_test1qz93vk0v6jcy4n8g4w3srqkjmcy6ryw90gngx0llvyek5rsc665n90486m4vvue3c2dsjg8sw3tchkjzgxgp4y77rkxqgxjd2h" #This is the third wallet address of the network admin. This should be the example address, if you use the public PREPROD test contract.

     - The default payment contract will collect a fee to support the network.
       - FEE_WALLET_ADDRESS="addr_test1qrgpga399l0r8fg7n0jfshhxsjl26w0uslxf5m02yclur8mremst4rk8xsz9lx78e9sdtjfsyj3c9kll2c4958uhkals2qrm9q" # This should be the example address, if you use the public PREPROD test contract. Otherwise the wallet address of the network that receives the fee. Please check the documentation of the payment contract you are using.
       - FEE_PERMILLE="50" #The fee for the network in permille. This should be the example, if you use the public PREPROD test contract. Otherwise please check the documentation of the payment contract you are using.

   - OPTIONAL Wallet data: Used to configure payment and purchase wallets, if you want to use existing wallets
     - PURCHASE_WALLET_MNEMONIC: The mnemonic of the wallet used to purchase any agent requests. This needs to have sufficient funds to pay, or be topped up. If you do not provide a mnemonic, a new one will be generated. Please ensure you export them immediately after creation and store them securely.
     - SELLING_WALLET_MNEMONIC: The mnemonic of the wallet used to interact with the smart contract. This only needs minimal funds, to cover the CARDANO Network fees. If you do not provide a mnemonic, a new one will be generated. Please ensure you export them immediately after creation and store them securely.
     - COLLECTION_WALLET_ADDRESS: The wallet address of the collection wallet. It will receive all payments after a successful and completed purchase (not refund). It does not need any funds, however it is strongly recommended to create it via a hardware wallet or ensure its secret is stored securely. If you do not provide an address, the SELLING_WALLET will be used.

6. If you're setting up the database for the first time or there are any schema changes also run run `npm run prisma:migrate` (this will also seed the database) otherwise `npm run prisma:generate` to generate the prisma client (only works after installing the dependencies via step 3) and afterwards optionally `npm run prisma:seed` to seed the database

## Build & Run

1. Copy the contents of the `.env.example` file to a `.env` next to it, and edit it with your values.
2. Run `npm run build` to build the files.
3. Run `npm run start` to start the application.

- You can run `npm run dev` to combine the 2 steps above, while listening to changes and restarting automatically.

To verify that the application is working correctly, point your browser to
[http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health) - you
should see a response with one books in JSON format.

You can see a OpenAPI (Swagger) definition of the REST API at
[http://localhost:3001/docs/](http://localhost:3001/docs/). This
interface also allows you to interact with the API.

## Run with Docker

1. Create the `.env` file with the correct values or inject the values to docker (migrate the database and optionally seed it first)
2. Build:

   ```
   docker build -t masumi-payment-service .
   ```

3. Run
   ```
   docker run -d -p 3001:3001 masumi-payment-service
   ```
   Replacing `masumi-payment-service` with the image name, and `3001:3001` with the `host:container` ports to publish.

# Security

This service needs full access to some wallets, as it uses them to handle payments. Therefore this service shall not be publicly exposed (open network or similar)

We also strongly recommend to use different wallets for different purposes.

- One wallet for handling incoming payments, this should have necessary funds to cover the smart contract interactions. It will automatically deduct a small amount from each payout to remain liquid. This wallet can also be used for handling the registration process. Otherwise you can separate this wallet in which case it shall have minimum funds to interact with the smart contract. You can also setup multiple wallets if you want to register more agents and improve performance with multiple parallel transactions.
- One wallet to collect all the funds after the payment unlocks. This ideally should be a cold storage wallet (and payment credentials will not be available to this service)
- One wallet to purchase and pay other agents. This wallet needs the funds you want to use to pay and some additional ADA to cover the transaction fees.

In addition please make sure to update this service with the latest version regularly to benefit from security fixes.

## Developing

## General

We are happy you want to contribute. If you are not a developer, you can still help, by letting us know if something is broken or needs to be improved.

As a developer you are of course also welcome to interact with our community to find Issues and Improvements to help with. We are also happy if you directly contribute to the codebase. To do so, please follow these steps:

1.  Fork the repository and create a new branch.
2.  Work on any changes you want to make.
3.  Afterwards create a PR and we will review and merge it ASAP.

We have some general guidelines to ensure code quality

- General recommendation. Please make yourself familiar with the codebase and the architecture before working on any changes. Keep in mind that we want to ensure security as we handle wallets and funds.
- We would love if you provide tests, to ensure your new code works
- Ensure your new version still builds correctly and all tests pass
- To ensure a consistent code style, please run `npm run lint` to lint the code and `npm run format` to format the code before creating a PR (or use the VSCode extensions)
- Provide some description of the changes you made and why you made them

### Visual Studio Code

To make your life easier, we can strongly recommend the following extensions

- Installing the [Eslint](`https://marketplace.cursorapi.com/items?itemName=dbaeumer.vscode-eslint`) and [Prettier - Code formatter](<`(https://marketplace.cursorapi.com/items?itemName=esbenp.prettier-vscode)`>) extensions is recommended. This ensures you can follow the formatting standard used.
- Install the [Prisma](`https://marketplace.cursorapi.com/items?itemName=Prisma.prisma`) extension if you plan to modify the database schema.
- In case you want to work with the smart contracts we recommend [Aiken](`https://marketplace.cursorapi.com/items?itemName=TxPipe.aiken`)

## Testing

## Testing

This project uses Jest as the testing framework. Here's how you can run tests:

- Run `npm run test` to execute all tests.
- Run `npm run test:watch` to run tests in watch mode, which will re-run tests on file changes.
- Run `npm run test:coverage` to see the test coverage report.

### Writing Tests

Tests are located in the `src` directory, alongside the files they are testing. Test files should follow the naming convention of `*.spec.ts` or `*.test.ts`.

### Folder structure

```
/src
    /routes
    /services
    /repositories
    /utils
```

The source folder contains sub-folders that arrange the application into logical
layers

- `routes:` This is the adapter layer of the Hexagonal Architecture. It adapts
  the HTTP transforms the HTTP requests from the external world to the service
  layer and transforms the objects returned by the service layer to HTTP
  responses.

- `services`: The service layer coordinates high-level activities such as
  creation of domain objects and asking them to perform tasks requested by the
  external world. It interacts with the repository layer to save and restore
  objects.

- `repositories`: The repository layer is responsible for persisting domain
  objects and performing CRUD operations on them. We use SQL to persist the
  changes

- The `utils` folder contains useful utilities and helpers.

## Roadmap

- [x] Enable all interactions with the smart contract
  - Payment
  - Purchases
  - Refunds
  - Disputes
- [x] Support Agent registration
- [x] Handle automatic decision making for time critical actions
- [x] Batch payments
- [x] Performance Improvements:
  - [x] Trigger following actions on the same wallet after previous ones are onchain
  - [x] Support multiple wallets for different agents
  - [x] Support multiple purchase wallets
- [x] Security:
  - [x] Support multiple collection wallets
  - [x] API Key Authentication with various scopes
    - [x] Read only
    - [x] Read/Write
    - [x] Admin
- [x] Support purchase limits per API Key
- [ ] Improve test coverage
- [ ] Improve documentation
- [ ] Code cleanup
- [ ] Admin Dashboard
