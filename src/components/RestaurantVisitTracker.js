'use client';

import { useEffect, useRef } from 'react';
import { useGuest } from '@/context/GuestContext';

export default function RestaurantVisitTracker({restaurantId}) {
  const {guest}=useGuest();
  const trackedVisit=useRef('');

  useEffect(()=>{
    if(!guest?.guest_id||!restaurantId) return;
    const visitKey=`${guest.guest_id}:${restaurantId}`;
    if(trackedVisit.current===visitKey) return;
    trackedVisit.current=visitKey;
    fetch('/api/guest/restaurant-visit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({guest,restaurant_id:restaurantId}),
      keepalive:true,
    }).catch(()=>{});
  },[guest,restaurantId]);

  return null;
}
