'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_MARKET, getMarket, normalizeMarketCode } from '@/lib/markets';
import { DEPLOYMENT_COUNTRY } from '@/lib/deployment';

const GuestContext = createContext(null);
export const GUEST_KEY = `tmg-guest-v1-${DEPLOYMENT_COUNTRY.toLowerCase()}`;

async function syncGuest(guest, trackVisit = true) {
  const response = await fetch('/api/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...guest, track_visit: trackVisit }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save your details.');
  return result.guest;
}

function recoverConfirmedPin(guest) {
  if (!guest) return null;
  const formattedAddress = String(guest.formatted_address || guest.house_number || '').trim();
  const hasLatitude = guest.latitude !== null && guest.latitude !== undefined && guest.latitude !== '';
  const hasLongitude = guest.longitude !== null && guest.longitude !== undefined && guest.longitude !== '';
  const latitude = Number(guest.latitude);
  const longitude = Number(guest.longitude);
  const hasCoordinates = hasLatitude && hasLongitude && Number.isFinite(latitude) && Number.isFinite(longitude);
  const canRecoverLegacyPin = !guest.location_source && formattedAddress && hasCoordinates;
  if (guest.location_source !== 'map_pin' && !canRecoverLegacyPin) return null;
  if (!formattedAddress || !hasCoordinates) return null;
  return {
    ...guest,
    formatted_address: formattedAddress,
    latitude,
    longitude,
    location_source: 'map_pin',
    location_precision: guest.location_precision || 'pin',
  };
}

function mergeSyncedGuest(localGuest, savedGuest) {
  const merged = { ...localGuest, ...(savedGuest || {}) };
  const confirmedPin = recoverConfirmedPin(localGuest) || recoverConfirmedPin(merged);
  if (!confirmedPin) return merged;
  return {
    ...merged,
    formatted_address: confirmedPin.formatted_address,
    latitude: confirmedPin.latitude,
    longitude: confirmedPin.longitude,
    location_accuracy: confirmedPin.location_accuracy ?? null,
    location_source: 'map_pin',
    location_precision: confirmedPin.location_precision || 'pin',
  };
}

export function GuestProvider({ children }) {
  const [guest, setGuest] = useState(null);
  const [guestReady, setGuestReady] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
      if (stored?.guest_id && stored?.consent_at) {
        const marketCode = normalizeMarketCode(stored.market_code || DEFAULT_MARKET);
        const market = getMarket(marketCode);
        const migratedStored = { ...stored, market_code:marketCode, country_code:market.countryCode, market_selection_source:'deployment' };
        const recoveredStored = recoverConfirmedPin(migratedStored);
        const safeStored = recoveredStored || {
          ...migratedStored,
          formatted_address: '',
          latitude: null,
          longitude: null,
          location_accuracy: null,
          location_source: null,
        };
        setGuest(safeStored);
        localStorage.setItem(GUEST_KEY, JSON.stringify(safeStored));
        (async () => {
          const saved = await syncGuest(safeStored).catch(() => null);
          if (saved) {
            const nextGuest = mergeSyncedGuest(safeStored, saved);
            localStorage.setItem(GUEST_KEY, JSON.stringify(nextGuest));
            setGuest(nextGuest);
          }
        })();
      }
    } catch {}
    setGuestReady(true);
  }, []);

  const saveGuest = useCallback((details) => {
    const record = {
      ...details,
      guest_id: details.guest_id || crypto.randomUUID(),
      consent_at: details.consent_at || new Date().toISOString(),
    };
    localStorage.setItem(GUEST_KEY, JSON.stringify(record));
    setGuest(record);
    syncGuest(record, true).then((saved) => {
      const syncedGuest = mergeSyncedGuest(record, saved);
      const current = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
      if (current?.guest_id === record.guest_id) {
        const mergedCurrent = mergeSyncedGuest(current, saved);
        localStorage.setItem(GUEST_KEY, JSON.stringify(mergedCurrent));
        setGuest((active) => active?.guest_id === record.guest_id ? mergeSyncedGuest(active, saved) : active);
      }
      return syncedGuest;
    }).catch(() => {});
    return record;
  }, []);

  const updateLocation = useCallback(async ({ latitude, longitude, location_accuracy, location_source }) => {
    if (!guest) return null;
    const saved = await syncGuest({ ...guest, latitude, longitude, location_accuracy, location_source }, false);
    const localGuest = mergeSyncedGuest({ ...guest, latitude, longitude, location_accuracy, location_source }, saved);
    localStorage.setItem(GUEST_KEY, JSON.stringify(localGuest));
    setGuest(localGuest);
    return localGuest;
  }, [guest]);

  const updateGuest = useCallback(async (details) => {
    if (!guest) return null;
    const record = { ...guest, ...details, guest_id: guest.guest_id, consent_at: guest.consent_at };
    const saved = await syncGuest(record, false);
    const localGuest = mergeSyncedGuest(record, saved);
    localStorage.setItem(GUEST_KEY, JSON.stringify(localGuest));
    setGuest(localGuest);
    return localGuest;
  }, [guest]);

  return <GuestContext.Provider value={{ guest, guestReady, saveGuest, updateLocation, updateGuest }}>{children}</GuestContext.Provider>;
}

export function useGuest() {
  const context = useContext(GuestContext);
  if (!context) throw new Error('useGuest must be used inside GuestProvider.');
  return context;
}
