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

- [Onion Architecture](http://jeffreypalermo.com/blog/the-onion-architecture-part-1/):
  Employed as the core architectural design pattern
- [Express-Zod-Api](https://www.npmjs.com/package/express-zod-api): Utilized as the framework for implementing our RESTful API with Swagger UI. The library uses:
  - [Express](http://expressjs.com/) as the framework for implementing our RESTful API
  - [Zod](https://www.npmjs.com/package/zod) for request validation
- [Prisma](https://www.prisma.io/): Implemented as the ORM to interact with our PostgreSQL database
- [DOTENV](https://www.npmjs.com/package/dotenv): Incorporated to securely load environment variables from `.env` files
- [Zod-to-OpenAPI](https://www.npmjs.com/package/@asteasolutions/zod-to-openapi): Used to generate the OpenAPI schema from the Zod schemas
- [Zod-to-OpenAPI](https://www.npmjs.com/package/@asteasolutions/zod-to-openapi): Used to generate the OpenAPI schema from the Zod schemas
- [Blockfrost](https://www.npmjs.com/package/@blockfrost/blockfrost-js): Used to interact with the Cardano blockchain
- [Jest](https://jestjs.io/): Used as the testing framework
- [Docker](https://www.docker.com/): Used to containerize the application for production

## Install

1. Install [node.js](https://nodejs.org/en/download/)
2. Clone this repository, and using a terminal navigate to its directory.
3. Run `yarn` or `npm install` to install the dependencies.
4. 4. Configure the environment variables by copying the `.env.example` file to `.env`or `.env.local` and setup the variables
   - DATABASE_URL: Please provide the endpoint for a PostgreSQL database to be used
   - PORT: The port to run the server on (default is 3001)
   - UPDATE_CARDANO_REGISTRY_INTERVAL: The interval to update the cardano registry as a cron string
   - ENCRYPTION_KEY: The key for encrypting the wallets in the database (Please see the [Security](#security) section for more details and security considerations)
   - UPDATE_PAYMENT_REGISTRY_INTERVAL: The interval to update the payment registry as a cron string
5. In case you need to apply migrations to the database run `yarn prisma:migrate` or `npm prisma:migrate` otherwise run `yarn prisma:generate` or `npm prisma:generate` to generate the prisma client (only works after installing the dependencies via step 3)
6. In case the database is not yet seeded (and or migrated) please also setup the following variables:
   - BLOCKFROST_API_KEY: An API Key from [https://blockfrost.io/](https://blockfrost.io/) for the correct blockchain network, you can create this for free
   - NETWORK: Currently only supports the PREPROD Cardano network or MAINNET
   - ADMIN_KEY: The key of the admin user, this key will have all permissions and can create new api_keys
   - Further configuration and explanation in the `.env.example` file
7. In case you want to seed the database now run `yarn prisma:seed` or `npm prisma:seed`

## Build & Run

1. Copy the contents of the `.env.example` file to a `.env` next to it, and edit it with your values.
2. Run `yarn build` or `npm build` to build the files.
3. Run `yarn start` or `npm start` to start the application.

- You can run `yarn dev` or `npm dev` to combine the 2 steps above, while listening to changes and restarting automatically.

To verify that the application is working correctly, point your browser to
[http://localhost:3001/api/health](http://localhost:3001/api/health) - you
should see a response with one books in JSON format.

You can see a OpenAPI (Swagger) definition of the REST API at
[http://localhost:3001/api-docs/](http://localhost:3001/api-docs/). This
interface also allows you to interact with the API.

## Run with Docker

1. Build:

   ```
   docker build -t masumi-payment-service .
   ```

2) Run
   ```
   docker run -d -p 3001:3001 masumi-payment-service
   ```
   Replacing `masumi-payment-service` with the image name, and `3001:3001` with the `host:container` ports to publish.

# Security

This service needs full access to some wallets, as it uses them to handle payments. Therefore this service shall not be publicly exposed (open network or similar)

We also strongly recommend to use different wallets for different purposes.

- One wallet for handling payments, this should have necessary funds to cover the payments
- One wallet for handling the registry updates, this wallet shall have minimum funds to interact with the smart contract (it will automatically deduct a small amount from each payout to remain liquid)
- One wallet to collect all the funds after the payment unlocks. This ideally should be a cold storage wallet (and payment credentials will not be available to this service)

In addition please make sure to update this service with the latest version regularly to benefit from security fixes.

## Developing

### Visual Studio Code

- Installing the Eslint (`dbaeumer.vscode-eslint`) and Prettier - Code formatter (`esbenp.prettier-vscode`) extensions is recommended.

## Linting & Formatting

- Run `yarn lint` or `npm lint` to lint the code.
- Run `yarn format` or `npm format` to format the code.

## Testing

## Testing

This project uses Jest as the testing framework. Here's how you can run tests:

- Run `yarn test` or `npm test` to execute all tests.
- Run `yarn test:watch` or `npm test:watch` to run tests in watch mode, which will re-run tests on file changes.
- Run `yarn test:coverage` or `npm test:coverage` to see the test coverage report.

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
