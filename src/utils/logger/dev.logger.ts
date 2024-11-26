import { createLogger, format, transports } from "winston";
const { combine, timestamp, printf, errors } = format;

function buildDevLogger() {
    const logFormat = printf(({ level, message, timestamp, stack }) => {
        return `${timestamp} ${level}: ${stack || message}`;
    });

    return createLogger({
        format: combine(
            format.colorize(),
            timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
            errors({ stack: true }),
            logFormat
        ),
        transports: [new transports.Console()],
    });
}

export { buildDevLogger };