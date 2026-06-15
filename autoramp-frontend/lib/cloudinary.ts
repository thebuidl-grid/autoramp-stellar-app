/**
 * Backend Upload Service
 * 
 * Handles file uploads via the backend proxy endpoint.
 */

import { api } from "./api";

/**
 * Uploads a file to the backend and returns the secure URL
 * @param file The file object to upload
 * @returns Promise<string> The secure URL of the uploaded file
 */
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await api.post<{ secure_url: string }>("/uploads", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response.data.secure_url;
  } catch (error) {
    console.error("Upload Error:", error);
    throw error;
  }
}
