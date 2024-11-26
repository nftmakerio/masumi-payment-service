import status from "http-status-codes";

export const notFound = (req: unknown, res: { status: (arg0: number) => void; json: (arg0: { message: string; }) => void; end: () => void; }) => {
    res.status(status.NOT_FOUND);
    res.json({
        message: "Requested Resource Not Found",
    });
    res.end();
};

// handle internal server errors
export const internalServerError = (err: { status: unknown; message: unknown; extra: unknown; }, req: unknown, res: { status: (arg0: unknown) => void; json: (arg0: { success: boolean; message: unknown; extra: unknown; errors: unknown; }) => void; end: () => void; }) => {
    res.status(err.status ?? status.INTERNAL_SERVER_ERROR);
    res.json({
        success: false,
        message: err.message,
        extra: err.extra,
        errors: err,
    });
    res.end();
};