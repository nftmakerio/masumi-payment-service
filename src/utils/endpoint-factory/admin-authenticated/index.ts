import { defaultEndpointsFactory } from "express-zod-api";
import { authMiddleware } from "@/utils/middleware/auth-middleware";

export const adminAuthenticatedEndpointFactory = defaultEndpointsFactory.addMiddleware(authMiddleware("ADMIN"))
