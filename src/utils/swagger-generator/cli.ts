import { generateOpenAPI } from ".";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function writeDocumentation() {
    // OpenAPI JSON
    const docs = generateOpenAPI();

    // Get the directory name in an ES module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    fs.writeFileSync(`${__dirname}/openapi-docs.json`, JSON.stringify(docs, null, 4), {
        encoding: "utf-8",
    });
}

writeDocumentation();