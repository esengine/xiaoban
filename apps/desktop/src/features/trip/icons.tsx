import type { Sky } from "@xiaoban/protocol";

const WET: ReadonlySet<Sky> = new Set(["light_rain", "rain", "heavy_rain", "storm"]);

export function WeatherIcon({ sky }: { sky: Sky }) {
  if (sky === "clear") {
    return (
      <svg className="weather-icon weather-icon--sun" aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
      </svg>
    );
  }
  if (WET.has(sky)) {
    return (
      <svg className="weather-icon weather-icon--rain" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7 15a4 4 0 010-8 5 5 0 019.6 1.5A3.5 3.5 0 0117 15z" />
        <path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" />
      </svg>
    );
  }
  return (
    <svg className="weather-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 18a4 4 0 010-8 5 5 0 019.6 1.5A3.5 3.5 0 0117 18z" />
    </svg>
  );
}

export function OutIcon() {
  return (
    <svg className="out-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg className="button-icon" aria-hidden="true" viewBox="0 0 24 24">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg className="button-icon" aria-hidden="true" viewBox="0 0 24 24">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a1 1 0 011-1h10" />
    </svg>
  );
}

export function CameraIcon() {
  return (
    <svg className="button-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg className="service-icon" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg className="check-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg className="close-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function MapIcon() {
  return (
    <svg className="output-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}
