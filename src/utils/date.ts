export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDurationFromIso(checkInIso: string, checkOutIso: string): string {
  const checkIn = new Date(checkInIso);
  const checkOut = new Date(checkOutIso);
  const durationMins = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
  const hours = Math.floor(durationMins / 60);
  const minutes = durationMins % 60;
  return `${hours}h ${minutes}m`;
}

export function formatClockTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
