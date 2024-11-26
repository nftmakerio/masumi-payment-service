import dotenv from 'dotenv';
dotenv.config();
if (process.env.DATABASE_URL == null)
    throw new Error("Undefined DATABASE_URL ENV variable")
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length <= 20)
    throw new Error("Undefined or unsecure ENCRYPTION_KEY ENV variable. Require min 20 char")

export const CONFIG = {
    PORT: process.env.PORT ?? "3001",
    DATABASE_URL: process.env.DATABASE_URL,
    BATCH_PAYMENT_INTERVAL: process.env.BATCH_PAYMENT_INTERVAL ?? "*/4 * * * *",
    CHECK_TX_INTERVAL: process.env.CHECK_TX_INTERVAL ?? "*/3 * * * *",
    CHECK_COLLECTION_INTERVAL: process.env.CHECK_COLLECTION_INTERVAL ?? "*/5 * * * *",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
};