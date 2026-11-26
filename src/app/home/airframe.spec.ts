import { bodyDirection, isBlocked, mounts } from './airframe';

describe('Generic airframe', () => {
  it('rotates a satellite direction into the aircraft axes', () => {
    const direction = bodyDirection(90, 20, 90, 20, 30);
    expect(direction[0]).toBeCloseTo(1, 8);
    expect(direction[1]).toBeCloseTo(0, 8);
    expect(direction[2]).toBeCloseTo(0, 8);
  });

  it('blocks an overhead ray from the belly and clears it from the crown', () => {
    const overhead = bodyDirection(0, 90, 0, 0, 0);
    expect(isBlocked(mounts[0].position, overhead)).toBeFalse();
    expect(isBlocked(mounts[4].position, overhead)).toBeTrue();
  });

  it('accounts for bank when checking the shoulder mount', () => {
    expect(isBlocked(mounts[2].position, bodyDirection(0, 90, 0, 0, 90))).toBeTrue();
    expect(isBlocked(mounts[2].position, bodyDirection(0, 90, 0, 0, -90))).toBeFalse();
    expect(isBlocked(mounts[3].position, bodyDirection(0, 90, 0, 0, 90))).toBeFalse();
    expect(isBlocked(mounts[3].position, bodyDirection(0, 90, 0, 0, -90))).toBeTrue();
  });
});
