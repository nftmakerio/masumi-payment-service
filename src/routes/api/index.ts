import { DependsOnMethod, Routing } from "express-zod-api";
import { healthEndpointGet } from '@/routes/api/health';
import { queryAPIKeyEndpointGet as queryCentralizedRegistrySourceGet, addAPIKeyEndpointPost as addCentralizedRegistrySourceEndpointPost, updateAPIKeyEndpointPatch, deleteAPIKeyEndpointDelete as deleteCentralizedRegistrySourceEndpointDelete } from "./api-key";
import { createPurchaseInitPost, queryPurchaseRequestGet, refundPurchasePatch } from "./purchases";
import { paymentInitPost, paymentUpdatePatch, queryPaymentEntryGet } from "./payments";
import { registerAgentPost, unregisterAgentDelete } from "./registry";
import { paymentSourceEndpointDelete, paymentSourceEndpointGet, paymentSourceEndpointPost } from "./payment-source";

export const apiRouter: Routing = {
    v1: {
        health: healthEndpointGet,
        "purchase": new DependsOnMethod({
            get: queryPurchaseRequestGet,
            post: createPurchaseInitPost,
            patch: refundPurchasePatch,
        }),
        "payment": new DependsOnMethod({
            get: queryPaymentEntryGet,
            post: paymentInitPost,
            patch: paymentUpdatePatch,
        }),
        "registry": new DependsOnMethod({
            post: registerAgentPost,
            delete: unregisterAgentDelete
        }),
        "api-key": new DependsOnMethod({
            get: queryCentralizedRegistrySourceGet,
            post: addCentralizedRegistrySourceEndpointPost,
            patch: updateAPIKeyEndpointPatch,
            delete: deleteCentralizedRegistrySourceEndpointDelete
        }),
        "payment-source": new DependsOnMethod({
            get: paymentSourceEndpointGet,
            post: paymentSourceEndpointPost,
            delete: paymentSourceEndpointDelete
        })
    }
}
