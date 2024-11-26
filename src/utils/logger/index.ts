import { Logger } from "winston";
import { buildDevLogger } from "@/utils/logger/dev.logger";
import { buildProdLogger } from "@/utils/logger/prod.logger";

let logger: Logger;
if (process.env.NODE_ENV === "dev") {
    logger = buildDevLogger();
} else {
    logger = buildProdLogger();
}
const stream = {
    write: function (message: unknown) {
        if (logger)
            logger.info(message);
    },
};
export { logger, stream };