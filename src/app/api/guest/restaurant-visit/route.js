import { NextResponse } from 'next/server';
import { saveGuest, saveGuestRestaurantVisit } from '@/lib/api';

export async function POST(request) {
  try {
    const payload=await request.json();
    const guest=payload.guest||{};
    await saveGuest({...guest,track_visit:false});
    const visit=await saveGuestRestaurantVisit({guest_id:guest.guest_id,restaurant_id:payload.restaurant_id});
    return NextResponse.json({ok:true,visit});
  } catch (error) {
    return NextResponse.json({error:error.message||'Could not record the restaurant visit.'},{status:400});
  }
}
