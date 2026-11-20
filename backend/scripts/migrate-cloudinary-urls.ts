/**
 * Migration Script: Re-upload old Cloudinary PDFs as resource_type 'raw'
 *
 * Old uploads used resource_type 'auto' which classified PDFs as 'image',
 * but the Cloudinary account blocks image delivery for PDFs.
 * This script scans the DB for all Cloudinary URLs, re-uploads them as 'raw',
 * and updates the DB records.
 *
 * Usage: npx ts-node scripts/migrate-cloudinary-urls.ts
 */

import { PrismaClient } from '@prisma/client';
import * as cloudinary from 'cloudinary';
import axios from 'axios';

const prisma = new PrismaClient();

cloudinary.v2.config({
  cloud_name: process.env.CL_NAME,
  api_key: process.env.CL_API_KEY,
  api_secret: process.env.CL_API_SECRET,
});

interface UrlRecord {
  table: string;
  id: string;
  field: string;
  url: string;
}

function isCloudinaryUrl(url: string): boolean {
  return url.includes('res.cloudinary.com') && url.includes('/image/upload/');
}

function extractPublicId(url: string): string {
  const parts = url.split('/');
  const uploadIndex = parts.findIndex(p => p === 'upload');
  if (uploadIndex === -1) return '';

  let startIndex = uploadIndex + 1;
  if (parts[startIndex]?.startsWith('v') && !isNaN(parseInt(parts[startIndex].substring(1)))) {
    startIndex++;
  }

  const publicIdWithExt = parts.slice(startIndex).join('/');
  return publicIdWithExt.split('.')[0];
}

async function reuploadAsRaw(url: string): Promise<string | null> {
  const publicId = extractPublicId(url);
  if (!publicId) {
    console.error(`  Could not extract public_id from: ${url}`);
    return null;
  }

  try {
    const result = await new Promise<cloudinary.UploadApiResponse>((resolve, reject) => {
      cloudinary.v2.uploader.upload(
        url,
        {
          resource_type: 'raw',
          folder: undefined,
          public_id: publicId,
          overwrite: true,
          timeout: 60000,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result!);
        },
      );
    });

    return result.secure_url;
  } catch (err: any) {
    console.error(`  Re-upload failed for ${publicId}: ${err.message}`);
    return null;
  }
}

async function testUrlAccess(url: string): Promise<boolean> {
  try {
    const resp = await axios.head(url, { timeout: 10000 });
    return resp.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n🔍 Scanning database for Cloudinary URLs...${dryRun ? ' (DRY RUN)' : ''}\n`);

  const urlRecords: UrlRecord[] = [];

  // Scan MerchantDocumentation
  const docs = await prisma.$queryRawUnsafe<{ id: string; cac_certificate: string | null; cac_e_status: string | null; memart: string | null; memorandum: string | null; proof_of_address: string | null; proof_of_funds: string | null; capital_source: string | null }[]>(
    'SELECT id, cac_certificate, cac_e_status, memart, memorandum, proof_of_address, proof_of_funds, capital_source FROM merchant_documentations',
  );

  for (const doc of docs) {
    const fields = ['cac_certificate', 'cac_e_status', 'memart', 'memorandum', 'proof_of_address', 'proof_of_funds', 'capital_source'] as const;
    for (const field of fields) {
      const val = doc[field];
      if (val && isCloudinaryUrl(val)) {
        urlRecords.push({ table: 'merchant_documentations', id: doc.id, field, url: val });
      }
    }
  }

  // Scan MerchantDirector
  const directors = await prisma.$queryRawUnsafe<{ id: string; proof_of_address: string | null; id_url: string | null }[]>(
    'SELECT id, proof_of_address, id_url FROM merchant_directors',
  );

  for (const d of directors) {
    for (const field of ['proof_of_address', 'id_url'] as const) {
      const val = d[field];
      if (val && isCloudinaryUrl(val)) {
        urlRecords.push({ table: 'merchant_directors', id: d.id, field, url: val });
      }
    }
  }

  // Scan MerchantShareholder
  const shareholders = await prisma.$queryRawUnsafe<{ id: string; proof_of_address: string | null; id_url: string | null }[]>(
    'SELECT id, proof_of_address, id_url FROM merchant_shareholders',
  );

  for (const s of shareholders) {
    for (const field of ['proof_of_address', 'id_url'] as const) {
      const val = s[field];
      if (val && isCloudinaryUrl(val)) {
        urlRecords.push({ table: 'merchant_shareholders', id: s.id, field, url: val });
      }
    }
  }

  console.log(`Found ${urlRecords.length} Cloudinary URLs across 3 tables\n`);

  let successCount = 0;
  let failCount = 0;
  let alreadyOkCount = 0;

  for (const record of urlRecords) {
    const hasAccess = await testUrlAccess(record.url);

    if (hasAccess) {
      console.log(`✅ [${record.table}] ${record.field} (${record.id}) — already accessible`);
      alreadyOkCount++;
      continue;
    }

    console.log(`❌ [${record.table}] ${record.field} (${record.id}) — 401, re-uploading...`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would re-upload: ${record.url}`);
      failCount++;
      continue;
    }

    const newUrl = await reuploadAsRaw(record.url);

    if (newUrl) {
      console.log(`  ✅ New URL: ${newUrl}`);

      // Update DB
      const columnName = record.field;
      await prisma.$executeRawUnsafe(
        `UPDATE ${record.table} SET ${columnName} = $1 WHERE id = $2`,
        newUrl,
        record.id,
      );
      console.log(`  ✅ DB updated`);
      successCount++;
    } else {
      console.log(`  ❌ Failed — manual re-upload needed`);
      failCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Total URLs: ${urlRecords.length}`);
  console.log(`  Already OK: ${alreadyOkCount}`);
  console.log(`  Fixed: ${successCount}`);
  console.log(`  Failed (need manual): ${failCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
