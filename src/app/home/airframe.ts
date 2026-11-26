type Vector = readonly [number, number, number];

// Body axes point forward, right, and down. Airframe dimensions are in meters.
export const mounts = [
  { name: 'Forward roof', description: 'Top of the fuselage near the nose', position: [9, 0, -1.76] },
  { name: 'Rear roof', description: 'Top of the fuselage near the tail', position: [-9, 0, -1.76] },
  { name: 'Upper right side', description: 'High on the right side, above the wing', position: [0, 1.5, -1.35] },
  { name: 'Underside', description: 'Bottom of the fuselage, between the wings', position: [0, 0, 2.01] }
] as const satisfies readonly { name: string; description: string; position: Vector }[];

const airframe: readonly { center: Vector; radii: Vector }[] = [
  { center: [0, 0, 0], radii: [18, 2, 2] }, // Fuselage
  { center: [-2, 0, 1.1], radii: [4.8, 16, 0.45] }, // Wing
  { center: [-14.5, 0, -0.4], radii: [2.9, 5.5, 0.28] }, // Horizontal tail
  { center: [-14, 0, -2.5], radii: [2.6, 0.35, 2.7] } // Vertical tail
];

export function drawAirframe(canvas: HTMLCanvasElement, selectedMount: number) {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  // View from above, with the nose up and the aircraft's right wing on the right.
  const scale = canvas.width / 420;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(scale, scale);
  context.fillStyle = '#48718a';
  context.fill(new Path2D('M195 213 L151 248 L151 257 L210 243 L269 257 L269 248 L225 213 Z'));
  context.fillStyle = '#648da7';
  context.fill(new Path2D('M197 122 L55 185 L54 198 L199 169 L221 169 L366 198 L365 185 L223 122 Z'));
  context.fillStyle = '#b4cfdf';
  context.fill(new Path2D('M210 39 Q193 52 193 85 L193 178 Q195 223 210 256 Q225 223 227 178 L227 85 Q227 52 210 39 Z'));
  context.fillStyle = '#23485e';
  context.fill(new Path2D('M198 71 Q210 58 222 71 L221 78 Q210 70 199 78 Z'));
  context.font = '600 19px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillStyle = '#a6c2d2';
  context.fillText('Nose', 210, 27);

  mounts.forEach(({ position: [forward, right, down] }, index) => {
    const selected = index === selectedMount;
    const underside = down > 0;
    const x = 210 + right * 8.5;
    const y = 147 - forward * 6;
    context.setLineDash(underside ? [3, 2] : []);
    context.beginPath();
    context.arc(x, y, selected ? 10 : 5, 0, Math.PI * 2);
    context.fillStyle = selected ? '#ff927b' : '#29495e';
    if (!underside) {
      context.fill();
    }
    context.strokeStyle = selected ? (underside ? '#9a3727' : '#fff0df') : '#29495e';
    context.lineWidth = 2;
    context.stroke();
  });
  context.restore();
}

export function bodyDirection(azimuth: number, elevation: number, heading: number, pitch: number, roll: number): Vector {
  const radians = Math.PI / 180;
  const relativeAzimuth = (azimuth - heading) * radians;
  const horizontal = Math.cos(elevation * radians);
  const forward = horizontal * Math.cos(relativeAzimuth);
  const right = horizontal * Math.sin(relativeAzimuth);
  const down = -Math.sin(elevation * radians);
  const cosPitch = Math.cos(pitch * radians);
  const sinPitch = Math.sin(pitch * radians);
  const cosRoll = Math.cos(roll * radians);
  const sinRoll = Math.sin(roll * radians);
  const pitchedDown = sinPitch * forward + cosPitch * down;
  return [
    cosPitch * forward - sinPitch * down,
    cosRoll * right + sinRoll * pitchedDown,
    -sinRoll * right + cosRoll * pitchedDown
  ];
}

export function isBlocked(origin: Vector, direction: Vector): boolean {
  return airframe.some(({ center, radii }) => {
    let a = 0;
    let halfB = 0;
    let c = -1;
    for (let axis = 0; axis < 3; axis++) {
      const offset = (origin[axis] - center[axis]) / radii[axis];
      const velocity = direction[axis] / radii[axis];
      a += velocity * velocity;
      halfB += offset * velocity;
      c += offset * offset;
    }
    const discriminant = halfB * halfB - a * c;
    return discriminant >= 0 && (-halfB + Math.sqrt(discriminant)) / a > 0.001;
  });
}
