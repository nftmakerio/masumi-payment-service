import { defaultEndpointsFactory } from "express-zod-api";
import { authMiddleware } from "@/utils/middleware/auth-middleware";

export const payAuthenticatedEndpointFactory = defaultEndpointsFactory.addMiddleware(authMiddleware("READ_PAY"))
