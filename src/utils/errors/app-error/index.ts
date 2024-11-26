export class AppError extends Error {
    status: number;

    constructor(message: string | undefined, status = 500) {
        super(message);

        // Save class name and status in properties
        // We can use any additional properties we want
        this.name = this.constructor.name;
        this.status = status;

        // Exclude our constructor from stack trace
        // (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}