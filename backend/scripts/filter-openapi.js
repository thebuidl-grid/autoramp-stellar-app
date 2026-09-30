const fs = require('fs');
const path = require('path');

const openapiPath = path.resolve(__dirname, '../../docs/openapi.json');
const rawData = fs.readFileSync(openapiPath, 'utf8');
const document = JSON.parse(rawData);

// Filter the document to only include business-facing tags
const BUSINESS_TAGS = ['Stablestack', 'Swap'];
const filteredPaths = {};

Object.keys(document.paths).forEach(pathKey => {
    const methods = document.paths[pathKey];
    const filteredMethods = {};
    let hasBusinessTag = false;

    Object.keys(methods).forEach(method => {
        const operation = methods[method];
        if (operation.tags && operation.tags.some(tag => BUSINESS_TAGS.includes(tag))) {
            hasBusinessTag = true;
            // Only keep the allowed tags in the operation
            operation.tags = operation.tags.filter(tag => BUSINESS_TAGS.includes(tag));
            // Ensure x-api-key is the only auth method for these docs
            operation.security = [{ 'API-Key': [] }];
            filteredMethods[method] = operation;
        }
    });

    if (hasBusinessTag) {
        filteredPaths[pathKey] = filteredMethods;
    }
});

document.paths = filteredPaths;
document.tags = document.tags ? document.tags.filter(tag => BUSINESS_TAGS.includes(tag.name)) : [];

// Clean up security definitions and other components
if (document.components && document.components.securitySchemes) {
    // Keep only API-Key
    const apiKey = document.components.securitySchemes['API-Key'];
    document.components.securitySchemes = { 'API-Key': apiKey };
}

// Write the filtered document back
fs.writeFileSync(openapiPath, JSON.stringify(document, null, 2));
console.log('OpenAPI specification filtered successfully.');
