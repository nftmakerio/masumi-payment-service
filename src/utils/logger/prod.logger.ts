import { createLogger, format, transports } from "winston";
const { combine, timestamp, errors, json } = format;

function buildProdLogger() {
    return createLogger({
        format: combine(timestamp(), errors({ stack: true }), json()),
        defaultMeta: { service: "registry-service" },
        transports: [new transports.Console()],
    });
}

export { buildProdLogger };