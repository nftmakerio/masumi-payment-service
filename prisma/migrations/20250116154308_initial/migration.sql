-- CreateEnum
CREATE TYPE "APIKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('READ', 'READ_PAY', 'ADMIN');

-- CreateEnum
CREATE TYPE "PaymentRequestErrorType" AS ENUM ('NETWORK_ERROR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PurchaseRequestErrorType" AS ENUM ('NETWORK_ERROR', 'INSUFFICIENT_FUNDS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('WEB3_CARDANO_V1');

-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PaymentRequested', 'PaymentConfirmed', 'PaymentInvalid', 'ResultGenerated', 'CompletedInitiated', 'CompletedConfirmed', 'Denied', 'RefundRequested', 'Refunded', 'WithdrawnInitiated', 'WithdrawnConfirmed', 'DisputedWithdrawn');

-- CreateEnum
CREATE TYPE "PurchasingRequestStatus" AS ENUM ('PurchaseRequested', 'PurchaseInitiated', 'PurchaseConfirmed', 'Completed', 'RefundRequestInitiated', 'RefundRequestConfirmed', 'RefundInitiated', 'RefundConfirmed', 'RefundRequestCanceledInitiated', 'Withdrawn', 'DisputedWithdrawn');

-- CreateEnum
CREATE TYPE "Network" AS ENUM ('PREVIEW', 'PREPROD', 'MAINNET');

-- CreateTable
CREATE TABLE "apiKey" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKey" TEXT NOT NULL,
    "status" "APIKeyStatus" NOT NULL,
    "permission" "Permission" NOT NULL,
    "usageLimited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "apiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageAmount" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "unit" TEXT NOT NULL,
    "apiKeyId" TEXT,

    CONSTRAINT "UsageAmount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellingWallet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "walletVkey" TEXT NOT NULL,
    "walletSecretId" TEXT NOT NULL,
    "pendingTransactionId" TEXT,
    "networkHandlerId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "SellingWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchasingWallet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "walletVkey" TEXT NOT NULL,
    "walletSecretId" TEXT NOT NULL,
    "pendingTransactionId" TEXT,
    "networkHandlerId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "PurchasingWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hash" TEXT,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletSecret" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "secret" TEXT NOT NULL,

    CONSTRAINT "WalletSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerWallet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "walletVkey" TEXT NOT NULL,
    "networkHandlerId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "BuyerWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerWallet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "walletVkey" TEXT NOT NULL,
    "networkHandlerId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "SellerWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionWallet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "networkHandlerId" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "CollectionWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "checkedById" TEXT NOT NULL,
    "smartContractWalletId" TEXT,
    "buyerWalletId" TEXT,
    "status" "PaymentRequestStatus" NOT NULL,
    "identifier" TEXT NOT NULL,
    "resultHash" TEXT,
    "submitResultTime" BIGINT NOT NULL,
    "unlockTime" BIGINT NOT NULL,
    "refundTime" BIGINT NOT NULL,
    "utxo" TEXT,
    "txHash" TEXT,
    "potentialTxHash" TEXT,
    "errorRetries" INTEGER NOT NULL DEFAULT 0,
    "errorType" "PaymentRequestErrorType",
    "errorNote" TEXT,
    "errorRequiresManualReview" BOOLEAN,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "networkHandlerId" TEXT NOT NULL,
    "sellerWalletId" TEXT NOT NULL,
    "purchasingWalletId" TEXT,
    "smartContractWalletId" TEXT,
    "status" "PurchasingRequestStatus" NOT NULL,
    "identifier" TEXT NOT NULL,
    "resultHash" TEXT,
    "submitResultTime" BIGINT NOT NULL,
    "unlockTime" BIGINT NOT NULL,
    "refundTime" BIGINT NOT NULL,
    "utxo" TEXT,
    "txHash" TEXT,
    "potentialTxHash" TEXT,
    "errorRetries" INTEGER NOT NULL DEFAULT 0,
    "errorType" "PurchaseRequestErrorType",
    "errorNote" TEXT,
    "errorRequiresManualReview" BOOLEAN,
    "triggeredById" TEXT NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestAmount" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "unit" TEXT NOT NULL,
    "paymentRequestId" TEXT,
    "purchaseRequestId" TEXT,

    CONSTRAINT "RequestAmount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkHandler" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "network" "Network" NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "page" INTEGER NOT NULL DEFAULT 1,
    "blockfrostApiKey" TEXT NOT NULL,
    "latestIdentifier" TEXT,
    "addressToCheck" TEXT NOT NULL,
    "scriptJSON" TEXT NOT NULL,
    "registryJSON" TEXT NOT NULL,
    "adminWalletId" TEXT NOT NULL,
    "FeePermille" INTEGER NOT NULL DEFAULT 50,
    "paymentType" "PaymentType" NOT NULL,
    "isSyncing" BOOLEAN NOT NULL DEFAULT false,
    "maxCollectRefundRetries" INTEGER NOT NULL DEFAULT 3,
    "maxCollectPaymentRetries" INTEGER NOT NULL DEFAULT 3,
    "maxCollectionRetries" INTEGER NOT NULL DEFAULT 3,
    "maxRefundRetries" INTEGER NOT NULL DEFAULT 3,
    "maxPaymentRetries" INTEGER NOT NULL DEFAULT 3,
    "maxRefundDenyRetries" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "NetworkHandler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminWallet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "networkHandlerAdminId" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "AdminWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apiKey_apiKey_key" ON "apiKey"("apiKey");

-- CreateIndex
CREATE INDEX "apiKey_apiKey_idx" ON "apiKey"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "SellingWallet_walletVkey_key" ON "SellingWallet"("walletVkey");

-- CreateIndex
CREATE UNIQUE INDEX "SellingWallet_networkHandlerId_key" ON "SellingWallet"("networkHandlerId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasingWallet_networkHandlerId_walletVkey_key" ON "PurchasingWallet"("networkHandlerId", "walletVkey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletSecret_secret_key" ON "WalletSecret"("secret");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerWallet_networkHandlerId_walletVkey_key" ON "BuyerWallet"("networkHandlerId", "walletVkey");

-- CreateIndex
CREATE UNIQUE INDEX "SellerWallet_networkHandlerId_walletVkey_key" ON "SellerWallet"("networkHandlerId", "walletVkey");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionWallet_networkHandlerId_key" ON "CollectionWallet"("networkHandlerId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionWallet_networkHandlerId_walletAddress_key" ON "CollectionWallet"("networkHandlerId", "walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_checkedById_identifier_key" ON "PaymentRequest"("checkedById", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_networkHandlerId_identifier_sellerWalletId_key" ON "PurchaseRequest"("networkHandlerId", "identifier", "sellerWalletId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkHandler_network_addressToCheck_key" ON "NetworkHandler"("network", "addressToCheck");

-- AddForeignKey
ALTER TABLE "UsageAmount" ADD CONSTRAINT "UsageAmount_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "apiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellingWallet" ADD CONSTRAINT "SellingWallet_walletSecretId_fkey" FOREIGN KEY ("walletSecretId") REFERENCES "WalletSecret"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellingWallet" ADD CONSTRAINT "SellingWallet_pendingTransactionId_fkey" FOREIGN KEY ("pendingTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellingWallet" ADD CONSTRAINT "SellingWallet_networkHandlerId_fkey" FOREIGN KEY ("networkHandlerId") REFERENCES "NetworkHandler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingWallet" ADD CONSTRAINT "PurchasingWallet_walletSecretId_fkey" FOREIGN KEY ("walletSecretId") REFERENCES "WalletSecret"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingWallet" ADD CONSTRAINT "PurchasingWallet_pendingTransactionId_fkey" FOREIGN KEY ("pendingTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasingWallet" ADD CONSTRAINT "PurchasingWallet_networkHandlerId_fkey" FOREIGN KEY ("networkHandlerId") REFERENCES "NetworkHandler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerWallet" ADD CONSTRAINT "BuyerWallet_networkHandlerId_fkey" FOREIGN KEY ("networkHandlerId") REFERENCES "NetworkHandler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerWallet" ADD CONSTRAINT "SellerWallet_networkHandlerId_fkey" FOREIGN KEY ("networkHandlerId") REFERENCES "NetworkHandler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionWallet" ADD CONSTRAINT "CollectionWallet_networkHandlerId_fkey" FOREIGN KEY ("networkHandlerId") REFERENCES "NetworkHandler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "NetworkHandler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_smartContractWalletId_fkey" FOREIGN KEY ("smartContractWalletId") REFERENCES "SellingWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_buyerWalletId_fkey" FOREIGN KEY ("buyerWalletId") REFERENCES "BuyerWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_networkHandlerId_fkey" FOREIGN KEY ("networkHandlerId") REFERENCES "NetworkHandler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_sellerWalletId_fkey" FOREIGN KEY ("sellerWalletId") REFERENCES "SellerWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_purchasingWalletId_fkey" FOREIGN KEY ("purchasingWalletId") REFERENCES "PurchasingWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_smartContractWalletId_fkey" FOREIGN KEY ("smartContractWalletId") REFERENCES "SellingWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "apiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAmount" ADD CONSTRAINT "RequestAmount_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAmount" ADD CONSTRAINT "RequestAmount_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkHandler" ADD CONSTRAINT "NetworkHandler_adminWalletId_fkey" FOREIGN KEY ("adminWalletId") REFERENCES "AdminWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminWallet" ADD CONSTRAINT "AdminWallet_networkHandlerAdminId_fkey" FOREIGN KEY ("networkHandlerAdminId") REFERENCES "NetworkHandler"("id") ON DELETE SET NULL ON UPDATE CASCADE;
