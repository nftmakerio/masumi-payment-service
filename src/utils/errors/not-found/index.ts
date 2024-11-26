import { AppError } from "../app-error";


export class NotFoundError extends AppError {
    constructor(message = 'Not Found') {
        super(message, 404);
    }
}