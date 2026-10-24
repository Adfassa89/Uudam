import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { rotateHeading, rotationFromEuler, smoothRotation, w3cAlpha, type Mat3 } from './projection';

/** Sensor rate and screen redraw rate. */
const SENSOR_MS = 33;
const FRAME_MS = 66;
/** Smoothing per sensor reading (0–1; lower = steadier but slower to follow). */
const SMOOTHING = 0.25;

/**
 * Phone orientation for the camera view as a device→world (East-North-Up)
 * matrix referenced to *true* north, updated about 15 times a second.
 * `headingOffsetDeg` is the user's manual correction for compass error.
 */
export function useOrientation(headingOffsetDeg: number): { R: Mat3 | null; available: boolean | null } {
  const [R, setR] = useState<Mat3 | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const smoothed = useRef<Mat3 | null>(null);
  // Magnetic declination (true − magnetic north) from the OS, which knows the local value.
  const declination = useRef(0);
  const offset = useRef(headingOffsetDeg);
  offset.current = headingOffsetDeg;

  useEffect(() => {
    let motionSub: { remove(): void } | null = null;
    let headingSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    DeviceMotion.isAvailableAsync().then((ok) => {
      if (cancelled) return;
      setAvailable(ok);
      if (!ok) return;
      DeviceMotion.setUpdateInterval(SENSOR_MS);
      motionSub = DeviceMotion.addListener((m) => {
        if (!m.rotation) return;
        const { alpha, beta, gamma } = m.rotation;
        const raw = rotationFromEuler(w3cAlpha(alpha, Platform.OS), beta, gamma);
        smoothed.current = smoothRotation(smoothed.current, raw, SMOOTHING);
      });
    });

    Location.watchHeadingAsync((h) => {
      if (h.trueHeading >= 0 && h.magHeading >= 0) {
        declination.current = ((h.trueHeading - h.magHeading + 540) % 360) - 180;
      }
    })
      .then((s) => {
        if (cancelled) s.remove();
        else headingSub = s;
      })
      .catch(() => {});

    // Redraw at a steady rate rather than on every sensor event.
    const timer = setInterval(() => {
      if (smoothed.current) setR(rotateHeading(smoothed.current, declination.current + offset.current));
    }, FRAME_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      motionSub?.remove();
      headingSub?.remove();
    };
  }, []);

  return { R, available };
}
