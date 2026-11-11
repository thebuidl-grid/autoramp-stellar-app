import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";

/**
 * Document Proxy Route
 *
 * Fetches protected documents from Cloudinary via the backend proxy.
 * The backend has the API credentials to fetch private/authenticated resources.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
        return NextResponse.json({ error: "Missing document URL" }, { status: 400 });
    }

    console.log(`[Docs Proxy] Request received for URL: ${url}`);

    try {
        if (url.includes('cloudinary.com')) {
            console.log(`[Docs Proxy] Fetching via backend proxy...`);

            const response = await axios.get(`${BACKEND_URL}/uploads/proxy`, {
                params: { url },
                responseType: 'arraybuffer',
                timeout: 30000,
            });

            const contentType = response.headers['content-type'] || 'application/octet-stream';

            console.log(`[Docs Proxy] Successfully fetched. Type: ${contentType}`);

            return new NextResponse(response.data, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600',
                },
            });
        }

        console.log(`[Docs Proxy] Non-Cloudinary URL, fetching directly...`);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
        });

        const contentType = response.headers['content-type'] || 'application/octet-stream';

        return new NextResponse(response.data, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
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
