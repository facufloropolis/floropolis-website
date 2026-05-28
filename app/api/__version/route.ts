// GET /api/__version
// v1 | 2026-05-27 | Job_PM [V8 SHADOW]
//
// Returns the deployed git SHA + build timestamp.
// Admin card footers show this so Facu can confirm he is on the latest deploy.
// Verification: curl https://www.floropolis.com/api/__version

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? 'local',
    deployed_at: process.env.VERCEL_GIT_COMMIT_TIMESTAMP
      ? new Date(Number(process.env.VERCEL_GIT_COMMIT_TIMESTAMP) * 1000).toISOString()
      : new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? 'local',
  });
}
