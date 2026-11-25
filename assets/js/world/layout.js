// The map, in metres. x runs east, z runs south, so north (towards Dubai) is −z.
// Polygons are [x, z] points; the road is the walking route through every stop.

export const KERALA = [
  [-30, 118], [10, 123], [48, 115], [74, 97], [86, 64], [82, 32], [89, 0], [84, -32],
  [91, -64], [82, -98], [58, -120], [20, -128], [-22, -129], [-60, -122], [-84, -100],
  [-92, -64], [-85, -30], [-91, 4], [-85, 40], [-89, 72], [-70, 101],
];

// Backwater lagoon across the middle of Kerala (a hole in the land).
export const LAGOON = [
  [-66, 18], [-58, 11], [-40, 9], [-20, 12], [0, 10], [22, 13], [44, 11], [58, 16],
  [56, 24], [40, 27], [18, 25], [-4, 28], [-24, 26], [-44, 28], [-60, 26],
];

// The wooden bridge over the lagoon: x from, x to, z from, z to.
export const BRIDGE = { x0: -13, x1: -7, z0: 2, z1: 35 };

export const DUBAI = [
  [-60, -333], [-10, -327], [40, -331], [80, -345], [96, -380], [92, -420], [98, -460],
  [84, -496], [50, -518], [0, -524], [-46, -520], [-84, -500], [-96, -462], [-90, -424],
  [-98, -388], [-86, -352],
];

export const RUNWAY_KERALA = { x0: -72, x1: 72, z: -108, width: 12 };
export const RUNWAY_DUBAI = { x0: -66, x1: 62, z: -345, width: 12 };

// Kerala footpath (laterite), south to north, through stops 0–6.
export const ROAD_KERALA = [
  [6, 100], [2, 86], [-12, 75], [-28, 70], [-34, 56], [-36, 41], [-24, 37], [-10, 36],
  [-10, 18], [-10, 2], [0, -6], [14, -12], [26, -14], [20, -26], [0, -34], [-18, -38],
  [-30, -38], [-24, -48], [-10, -56], [-5, -63], [-5, -74], [-5, -88], [-20, -95],
  [-40, -97], [-50, -97],
];

// Dubai: from arrivals into the city.
export const ROAD_DUBAI = [
  [0, -372], [0, -382], [0, -392], [-6, -401], [-14, -406],
];

// Ring road through downtown Dubai, driven by taxis.
export const DUBAI_LOOP = [
  [-58, -398], [0, -394], [58, -398], [66, -440], [58, -486], [0, -492], [-58, -486], [-66, -440],
];

// Where each story stop stands. `road` is the index of its point on the road.
// `face` is the way Hadi faces on arrival; `view` is the camera's orbit angle
// (0 = camera to the south looking north, π/2 = camera to the east looking west).
// `look` is what the camera drifts towards while you stand there; `sign` is
// where the stop's sign stands (it faces the arrival camera).
export const STOPS = {
  home: { x: 6, z: 100, road: 0, face: Math.PI, view: 0.25, look: [-2, 3, 98], sign: [-0.5, 95] },
  college: { x: -28, z: 70, road: 3, face: -Math.PI / 2, view: Math.PI / 2, look: [-40, 4, 68], sign: [-34, 76] },
  freelance: { x: -36, z: 41, road: 5, face: -Math.PI * 0.6, view: Math.PI * 0.4, look: [-41, 2.5, 43], sign: [-40, 34.5] },
  nucore: { x: 26, z: -14, road: 12, face: Math.PI / 2, view: -Math.PI / 2, look: [34, 5, -9], sign: [29, -22] },
  projects: { x: -30, z: -38, road: 16, face: -Math.PI / 2, view: Math.PI / 2, look: [-41, 3.5, -38], sign: [-31, -31] },
  airport: { x: -5, z: -63, road: 19, face: Math.PI, view: 0, look: [-3, 5.5, -70], sign: [-11, -68.5] },
  gate: { x: -50, z: -97, road: 24, face: Math.PI, view: 0.3, look: [-54, 4, -105], sign: [-61, -95] },
  dubai: { x: 0, z: -382, road: 1, face: 1.35, view: Math.PI, look: [1, 4.5, -375], sign: [-9, -378] },
};

// Things that stand on the map. Positions in metres; rot in radians about y.
export const PLACES = {
  home: { x: -8, z: 104, rot: Math.PI / 2 },
  college: { x: -46, z: 70, rot: Math.PI / 2 },
  freelanceDesk: { x: -42, z: 44, rot: Math.PI / 2 },
  nucore: { x: 40, z: -16, rot: -Math.PI / 2 },
  nucoreAnnex: { x: 46, z: -2, rot: -Math.PI / 2 },
  projects: { x: -40, z: -38 },
  terminal: { x0: -34, x1: 26, z0: -88, z1: -72, gap0: -9, gap1: -1 },
  tower: { x: 40, z: -84 },
  plane: { x: -58, z: -108 },
  sabre: { x: 150, z: -175 },
  redis: { x: 9, z: -68 },
  arrivals: { x0: -22, x1: 22, z0: -372, z1: -360 },
};

// Cars you can drive, and taxi stands. h is the heading: facing (sin h, cos h).
export const VEHICLES = {
  carKerala: { x: 1, z: 113, h: Math.PI },
  taxiKerala: { x: 16, z: 111, h: Math.PI },
  carDubai: { x: -24, z: -383, h: Math.PI },
  taxiDubai: { x: 20, z: -389, h: -Math.PI / 2 },
};

// Where a taxi can take you in Dubai (the Kerala taxi goes to the stops).
export const DUBAI_PLACES = [
  { name: 'Arrivals', x: 0, z: -386 },
  { name: 'Downtown, by the tower', x: 8, z: -428 },
  { name: 'The plane', x: -28, z: -355, plane: true },
];
