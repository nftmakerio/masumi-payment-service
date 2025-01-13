import "dotenv/config";
import { CONFIG } from "@/utils/config/";
import { logger } from "@/utils/logger/";
import InitSchedules from "@/services/schedules";
import { createConfig, createServer } from "express-zod-api";
import { router } from "@/routes/index";
import ui from "swagger-ui-express";
import { generateOpenAPI } from "@/utils/swagger-generator";
import { cleanupDB, initDB } from "@/utils/db";


async function initialize() {
    await initDB();
    await InitSchedules();
}

initialize()
    .then(async () => {
        const PORT = CONFIG.PORT;
        const serverConfig = createConfig({
            inputSources: {
                //read from body on get requests
                get: ["query", "params"],
                post: ["body", "params", "files"],
                put: ["body", "params"],
                patch: ["body", "params"],
                delete: ["query", "params"],
            },
            startupLogo: false,
            beforeRouting: ({ app, }) => {
                logger.info("Serving the API documentation at localhost:" + PORT + "/docs");
                app.use("/docs", ui.serve, ui.setup(generateOpenAPI()));
            },
            http: {
                listen: PORT,
            },
            cors: ({ defaultHeaders, }) => ({
                ...defaultHeaders,
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "5000",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH",
                "Access-Control-Expose-Headers": "Content-Range, X-Total-Count"
            }),
            logger: logger
        });


        createServer(serverConfig, router);

    })
    .catch((e) => {
        throw e;
    })
    .finally(async () => {
        await cleanupDB();
    });
