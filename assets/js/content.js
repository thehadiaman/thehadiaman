// What the departure board says. The 3D board and the flat fallback both read this file.

// Day Hadi lands in Dubai (Dubai time). The status flap and board title follow it:
// before → ON TIME, on the day → BOARDING, after → LANDED (and the board becomes ARRIVALS).
export const ARRIVAL = '2026-12-05';

export const STATUS_WORDS = [' ', 'ON TIME', 'BOARDING', 'LANDED'];

// One layout per width. `status` is the coloured remarks flap, which takes the
// last `span` columns of its row.
export const LAYOUTS = {
  wide: {
    cols: 28,
    lines: ['HADI AMAN', 'SENIOR FULL STACK DEVELOPER', 'CCJ > DXB  05 DEC'],
    status: { row: 2, span: 6 },
  },
  narrow: {
    cols: 16,
    lines: ['HADI AMAN', 'SENIOR FULL', 'STACK DEVELOPER', 'CCJ > DXB', '05 DEC'],
    status: { row: 4, span: 7 },
  },
};

export const layoutFor = (width) => (width < 600 ? 'narrow' : 'wide');

export function dubaiDate(date = new Date()) {
  // en-CA formats as YYYY-MM-DD, which compares correctly as a string
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function dubaiClock(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

export function flightStatus(date = new Date()) {
  const today = dubaiDate(date);
  if (today < ARRIVAL) return 'ON TIME';
  if (today === ARRIVAL) return 'BOARDING';
  return 'LANDED';
}

export const boardTitle = (status) => (status === 'LANDED' ? 'ARRIVALS' : 'DEPARTURES');
