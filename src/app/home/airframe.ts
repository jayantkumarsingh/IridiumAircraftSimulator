type Vector = readonly [number, number, number];

// Body axes point forward, right, and down. Airframe dimensions are in meters.
export const mounts = [
  { name: 'Forward crown', position: [9, 0, -1.76] },
  { name: 'Aft crown', position: [-9, 0, -1.76] },
  { name: 'Right shoulder', position: [0, 1.5, -1.35] },
  { name: 'Belly', position: [0, 0, 2.01] }
] as const satisfies readonly { name: string; position: Vector }[];

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
  const scale = canvas.width / 48;
  const project = ([forward, right, down]: Vector) => [
    canvas.width / 2 + (forward * 0.86 + right * 0.5) * scale,
    canvas.height / 2 + (-forward * 0.24 + right * 0.42 + down * 0.87) * scale
  ] as const;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#638ca5';
  context.lineWidth = 1.3;
  for (const { center, radii } of airframe) {
    for (let axis = 0; axis < 3; axis++) {
      const first = (axis + 1) % 3;
      const second = (axis + 2) % 3;
      context.beginPath();
      for (let step = 0; step <= 48; step++) {
        const angle = step * Math.PI / 24;
        const point: [number, number, number] = [...center];
        point[first] += Math.cos(angle) * radii[first];
        point[second] += Math.sin(angle) * radii[second];
        const [x, y] = project(point);
        context.lineTo(x, y);
      }
      context.closePath();
      context.stroke();
    }
  }
  const [x, y] = project(mounts[selectedMount].position);
  context.fillStyle = '#ff927b';
  context.beginPath();
  context.arc(x, y, 5, 0, Math.PI * 2);
  context.fill();
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
