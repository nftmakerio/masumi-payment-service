import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
    //log: ["query", "info", "warn", "error"]
});


export async function cleanupDB() {
    await prisma.$disconnect()
}

export async function initDB() {
    await prisma.$connect()
}
