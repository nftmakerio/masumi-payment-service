import { generateOpenAPI } from '.';
import fs from 'fs';

export function writeDocumentation() {
    // OpenAPI JSON
    const docs = generateOpenAPI();

    fs.writeFileSync(`${__dirname}/openapi-docs.json`, JSON.stringify(docs, null, 4), {
        encoding: 'utf-8',
    });
}
writeDocumentation();