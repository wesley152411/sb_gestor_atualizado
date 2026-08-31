import { NextResponse } from 'next/server';
import { getPublicLegalVersions } from '@/lib/legal-documents';

export async function GET() {
  return NextResponse.json(getPublicLegalVersions());
}
