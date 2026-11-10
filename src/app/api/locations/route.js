import { NextResponse } from 'next/server';
import { GHANA_LOCATIONS } from '@/lib/markets';
import { assertServerMarket, serverDefaultMarket } from '@/lib/deploymentServer';

export async function GET(request) {
  try {
    const cityCode = new URL(request.url).searchParams.get('city');
    const market = assertServerMarket(new URL(request.url).searchParams.get('market') || serverDefaultMarket());
    const municipalities = GHANA_LOCATIONS[market] || [];
    const municipality = municipalities.find(([code]) => code === cityCode);
    const rows = cityCode
      ? (municipality?.[2] || []).map((name,index) => ({ code:`${cityCode}-${index + 1}`, name }))
      : municipalities.map(([code,name]) => ({ code,name }));
    return NextResponse.json(rows);
  } catch (error) {
    const status=String(error.message||'').includes('deployment cannot access')?400:502;
    return NextResponse.json({ error: error.message }, { status });
  }
}
