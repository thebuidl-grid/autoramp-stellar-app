import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CL_NAME,
    api_key: process.env.CL_API_KEY,
    api_secret: process.env.CL_API_SECRET,
});



/**
 * Document Proxy Route
 *
 * Fetches protected documents from remote URLs (Cloudinary/S3)
 * and streams them to the client to avoid CORS and Auth headers issues in the browser.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "Missing document URL" }, { status: 400 });
    }

    console.log(`[Docs Proxy] Request received for URL: ${url}`);

    try {
        let finalUrl = url;

        if (url.includes('cloudinary.com')) {
            console.log(`[Docs Proxy] Detected Cloudinary URL. Attempting to generate signed access...`);

            const parts = url.split('/');
            const uploadIndex = parts.findIndex(p => p === 'upload' || p === 'private' || p === 'authenticated');

            if (uploadIndex !== -1) {
                let startIndex = uploadIndex + 1;

                if (parts[startIndex].startsWith('v') && !isNaN(parseInt(parts[startIndex].substring(1)))) {
                    startIndex++;
                }

                const publicIdWithExt = parts.slice(startIndex).join('/');
                const publicId = publicIdWithExt.split('.')[0];
                const resourceType = url.includes('/raw/') ? 'raw' : (url.includes('/video/') ? 'video' : 'image');
                const type = url.includes('/authenticated/') ? 'authenticated' : (url.includes('/private/') ? 'private' : 'upload');

                console.log(`[Docs Proxy] Extracted Public ID: ${publicId}, Type: ${type}, Resource: ${resourceType}`);

                finalUrl = cloudinary.url(publicId, {
                    resource_type: resourceType,
                    type: type,
                    sign_url: true,
                    secure: true,
                    expires_at: Math.floor(Date.now() / 1000) + 3600
                });

                console.log(`[Docs Proxy] Generated signed URL: ${finalUrl}`);
            }
        }

        console.log(`[Docs Proxy] Fetching document content...`);

        const response = await axios.get(finalUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
        });

        console.log(`[Docs Proxy] Successfully fetched content. Status: ${response.status}, Type: ${response.headers['content-type']}`);

        const contentType = response.headers['content-type'] || 'application/octet-stream';

        return new NextResponse(response.data, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Content-Disposition': `inline; filename="${url.split('/').pop() || 'document'}"`,
            },
        });

    } catch (error: any) {
        const status = error.response?.status || 500;
        const errorMessage = error.response?.data?.toString() || error.message;

        console.error(`[Docs Proxy] Error fetching document:`, {
            url,
            status,
            message: errorMessage
        });

        return NextResponse.json({
            error: "Failed to fetch document.",
            details: errorMessage,
            status: status
        }, { status });
    }
}