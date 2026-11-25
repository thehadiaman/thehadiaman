// A low-poly airliner, built from primitives. Nose points +x, wings span z.
// White body, cobalt tail with a marigold stripe: the site's colours as a livery.
import {
  Group, Mesh, CylinderGeometry, SphereGeometry, ConeGeometry, BoxGeometry, Shape,
  ExtrudeGeometry, MeshStandardMaterial,
} from '../../vendor/three.min.js';

const white = new MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.45, metalness: 0.1, flatShading: true });
const grey = new MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.5, metalness: 0.3, flatShading: true });
const dark = new MeshStandardMaterial({ color: '#2a2e35', roughness: 0.4, metalness: 0.2 });
const cobalt = new MeshStandardMaterial({ color: '#2448c9', roughness: 0.5, flatShading: true });
const marigold = new MeshStandardMaterial({ color: '#f3aa1c', roughness: 0.5 });

function planform(points, thickness, material) {
  const shape = new Shape(points.map(([x, y]) => ({ x, y })));
  const geo = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  return new Mesh(geo, material);
}

export function createPlane() {
  const plane = new Group();
  const body = new Group();
  plane.add(body);

  const R = 1.9;
  const L = 26;
  const fuselage = new Mesh(new CylinderGeometry(R, R, L, 16), white);
  fuselage.rotation.z = Math.PI / 2;
  body.add(fuselage);

  const nose = new Mesh(new SphereGeometry(R, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.rotation.z = -Math.PI / 2;
  nose.scale.set(1, 1.6, 1);
  nose.position.x = L / 2;
  body.add(nose);

  const tail = new Mesh(new ConeGeometry(R, 7, 16, 1, true), white);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-L / 2 - 3.5, 0.55, 0);
  tail.scale.set(1, 1, 0.8);
  body.add(tail);

  // cockpit windows and a window band
  const cockpit = new Mesh(new BoxGeometry(1.2, 0.5, 2.4), dark);
  cockpit.position.set(L / 2 + 1.4, 0.75, 0);
  cockpit.rotation.z = -0.5;
  body.add(cockpit);
  for (const side of [-1, 1]) {
    const band = new Mesh(new BoxGeometry(L - 4, 0.38, 0.1), dark);
    band.position.set(-0.5, 0.55, side * (R - 0.02));
    body.add(band);
    const stripe = new Mesh(new BoxGeometry(L - 2, 0.16, 0.1), marigold);
    stripe.position.set(-0.5, -0.2, side * (R - 0.01));
    body.add(stripe);
    const door = new Mesh(new BoxGeometry(1, 1.9, 0.12), grey);
    door.position.set(L / 2 - 4, 0.1, side * (R - 0.02));
    body.add(door);
  }

  // wings: swept planform, slight dihedral
  for (const side of [-1, 1]) {
    const wing = planform([[0, 0], [-4.5, 14.5], [-6.8, 14.5], [-6, 0]], 0.42, white);
    wing.rotation.x = -Math.PI / 2;
    wing.position.set(2.5, -0.9, 0);
    if (side < 0) wing.scale.y = -1;
    wing.rotation.z = 0;
    wing.rotateX(side * 0.06);
    body.add(wing);
    const engine = new Mesh(new CylinderGeometry(0.9, 0.75, 3.6, 14), grey);
    engine.rotation.z = Math.PI / 2;
    engine.position.set(2.2, -1.9, side * 5.4);
    body.add(engine);
    const intake = new Mesh(new CylinderGeometry(0.72, 0.72, 0.1, 14), dark);
    intake.rotation.z = Math.PI / 2;
    intake.position.set(4.02, -1.9, side * 5.4);
    body.add(intake);
    const stabiliser = planform([[0, 0], [-2.6, 5.6], [-4.2, 5.6], [-3.8, 0]], 0.25, white);
    stabiliser.rotation.x = -Math.PI / 2;
    stabiliser.position.set(-L / 2 - 2.2, 0.7, 0);
    if (side < 0) stabiliser.scale.y = -1;
    body.add(stabiliser);
  }

  // tail fin in cobalt with a marigold stripe
  const fin = planform([[0, 0], [-4.4, 6.8], [-6.6, 6.8], [-6.2, 0]], 0.3, cobalt);
  fin.position.set(-L / 2 + 0.6, 1.4, 0);
  body.add(fin);
  const finStripe = planform([[0, 0], [-1.2, 1.9], [-1.9, 1.9], [-0.7, 0]], 0.34, marigold);
  finStripe.position.set(-L / 2 - 2.2, 4.1, 0);
  body.add(finStripe);

  // landing gear
  const gear = [];
  for (const [x, z] of [[L / 2 - 3, 0], [1.5, 2.2], [1.5, -2.2]]) {
    const leg = new Mesh(new CylinderGeometry(0.12, 0.12, 1.6, 6), grey);
    leg.position.set(x, -R - 0.5, z);
    const wheel = new Mesh(new CylinderGeometry(0.55, 0.55, 0.45, 12), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, -R - 1.25, z);
    body.add(leg, wheel);
    gear.push(leg, wheel);
  }

  plane.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  // wheels touch the ground when the group sits at y = 0
  body.position.y = R + 1.8;
  return { plane, body, gear, height: R + 1.8 };
}

// Boarding stairs, as a separate prop. Top at about the door's height.
export function createStairs() {
  const group = new Group();
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const step = new Mesh(new BoxGeometry(1.3, 0.12, 0.42), grey);
    step.position.set(0, 0.25 + i * 0.36, -i * 0.38);
    group.add(step);
  }
  const rail = new MeshStandardMaterial({ color: '#d7d9dd', roughness: 0.5, metalness: 0.4 });
  for (const side of [-1, 1]) {
    const r = new Mesh(new BoxGeometry(0.08, 0.08, 4.4), rail);
    r.position.set(side * 0.62, 2.55, -1.55);
    r.rotation.x = 0.76;
    group.add(r);
  }
  const base = new Mesh(new BoxGeometry(1.6, 0.5, 2.6), new MeshStandardMaterial({ color: '#f3aa1c', roughness: 0.6 }));
  base.position.set(0, 0.25, -0.6);
  group.add(base);
  group.traverse((o) => o.isMesh && (o.castShadow = true));
  return group;
}
