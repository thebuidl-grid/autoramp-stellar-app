import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateOpenApi() {
    // Inject dummy environment variables to bypass constructor checks
    process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_dummy_key';
    process.env.RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'dummy_secret';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';

    const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });

    const config = new DocumentBuilder()
        .setTitle('CNGN Ramp Business API')
        .setDescription('Programmatic API for businesses to perform onramp, offramp, and swap operations.')
        .setVersion('1.0')
        .addApiKey(
            {
                type: 'apiKey',
                name: 'x-api-key',
                in: 'header',
                description: 'Your business API key generated from the admin portal.',
            },
            'API-Key',
        )
        .build();

    const document = SwaggerModule.createDocument(app, config);

    // Filter the document to only include business-facing tags
    const BUSINESS_TAGS = ['Stablestack', 'Swap'];
    const filteredPaths: any = {};

    Object.keys(document.paths).forEach(pathKey => {
        const methods: any = document.paths[pathKey];
        const filteredMethods: any = {};
        let hasBusinessTag = false;

        Object.keys(methods).forEach(method => {
            const operation = methods[method];
            if (operation.tags && operation.tags.some((tag: string) => BUSINESS_TAGS.includes(tag))) {
                hasBusinessTag = true;
                // Only keep the allowed tags in the operation
                operation.tags = operation.tags.filter((tag: string) => BUSINESS_TAGS.includes(tag));
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
    if (document.tags) {
        document.tags = (document.tags as any[]).filter(tag => BUSINESS_TAGS.includes(tag.name));
    }

    // Clean up security definitions and other components if needed
    if (document.components?.securitySchemes) {
        // Keep only API-Key
        const securitySchemes = document.components.securitySchemes as any;
        const apiKey = securitySchemes['API-Key'];
        document.components.securitySchemes = { 'API-Key': apiKey };
    }

    // Create docs directory if it doesn't exist
    const docsDir = path.resolve(process.cwd(), '../docs');
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    const outputPath = path.join(docsDir, 'openapi.json');
    fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

    console.log(`OpenAPI specification exported to: ${outputPath}`);
    await app.close();
    process.exit(0);
}

generateOpenApi().catch((err) => {
    console.error('Error generating OpenAPI spec:', err);
    process.exit(1);
});
