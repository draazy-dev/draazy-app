import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createFromOptions = vi.fn();
vi.mock('@mediapipe/tasks-vision', () => ({ FaceLandmarker: { createFromOptions: (...a) => createFromOptions(...a) } }));

let face;

beforeEach(async () => {
  vi.resetModules();
  createFromOptions.mockReset();
  face = await import('../../../../src/lib/identity-verification/face.js');
});
afterEach(() => vi.restoreAllMocks());

const points = ({ left = 0.4, right = 0.6, nose = 0.5, size = 0.3, cx = 0.5, cy = 0.58 } = {}) => {
  const landmarks = Array.from({ length: 300 }, () => ({ x: cx, y: cy }));
  landmarks[10] = { x: cx - size / 2, y: cy - size / 2 };
  landmarks[11] = { x: cx + size / 2, y: cy + size / 2 };
  landmarks[33] = { x: left, y: cy };
  landmarks[263] = { x: right, y: cy };
  landmarks[1] = { x: nose, y: cy };
  return landmarks;
};
const resultOf = (landmarks, smile = {}) => ({
  faceLandmarks: [landmarks],
  faceBlendshapes: [{ categories: Object.entries(smile).map(([categoryName, score]) => ({ categoryName, score })) }],
});

describe('loadFaceLandmarker', () => {
  it('creates one video-mode single-face landmarker and shares it', async () => {
    const landmarker = { id: 1 };
    createFromOptions.mockResolvedValue(landmarker);
    const [a, b] = await Promise.all([face.loadFaceLandmarker(), face.loadFaceLandmarker()]);
    expect(a).toBe(landmarker);
    expect(b).toBe(landmarker);
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    const [wasm, options] = createFromOptions.mock.calls[0];
    expect(wasm.wasmLoaderPath).toEqual(expect.any(String));
    expect(wasm.wasmBinaryPath).toEqual(expect.any(String));
    expect(options).toMatchObject({ baseOptions: { modelAssetPath: '/models/face_landmarker.task' }, runningMode: 'VIDEO', numFaces: 1 });
  });

  it('retries after a failed load', async () => {
    createFromOptions.mockRejectedValueOnce(new Error('wasm blocked')).mockResolvedValueOnce({ ok: true });
    await expect(face.loadFaceLandmarker()).rejects.toThrow('wasm blocked');
    await expect(face.loadFaceLandmarker()).resolves.toEqual({ ok: true });
    expect(createFromOptions).toHaveBeenCalledTimes(2);
  });
});

describe('readSelfieGuidance', () => {
  it('asks for a face when none is found', () => {
    expect(face.readSelfieGuidance(undefined, 'hold')).toEqual({ ok: false, messageKey: 'noFace' });
    expect(face.readSelfieGuidance({ faceLandmarks: [[]] }, 'hold')).toEqual({ ok: false, messageKey: 'noFace' });
  });

  it('guides framing: closer, back off and centre', () => {
    expect(face.readSelfieGuidance(resultOf(points({ size: 0.1 })), 'hold').messageKey).toBe('closer');
    expect(face.readSelfieGuidance(resultOf(points({ size: 0.7 })), 'hold').messageKey).toBe('backOff');
    expect(face.readSelfieGuidance(resultOf(points({ cx: 0.8 })), 'hold').messageKey).toBe('center');
    expect(face.readSelfieGuidance(resultOf(points({ cy: 0.3 })), 'hold').messageKey).toBe('center');
  });

  it('accepts a well-framed face on the hold stage', () => {
    expect(face.readSelfieGuidance(resultOf(points()), 'hold')).toEqual({ ok: true, messageKey: 'hold' });
    expect(face.readSelfieGuidance(resultOf(points()), 'unknown-stage')).toEqual({ ok: true, messageKey: 'hold' });
  });

  it('checks for a smile using the stronger side', () => {
    expect(face.readSelfieGuidance(resultOf(points(), { mouthSmileLeft: 0.1 }), 'smile')).toEqual({ ok: false, messageKey: 'smilePrompt' });
    expect(face.readSelfieGuidance(resultOf(points(), { mouthSmileLeft: 0.1, mouthSmileRight: 0.4 }), 'smile')).toEqual({ ok: true, messageKey: 'smileOk' });
    expect(face.readSelfieGuidance({ faceLandmarks: [points()] }, 'smile').messageKey).toBe('smilePrompt');
  });

  it('detects left and right head turns from the nose offset', () => {
    const left = resultOf(points({ nose: 0.56 }));
    const right = resultOf(points({ nose: 0.44 }));
    expect(face.readSelfieGuidance(left, 'left')).toEqual({ ok: true, messageKey: 'gotIt' });
    expect(face.readSelfieGuidance(right, 'left')).toEqual({ ok: false, messageKey: 'turnLeft' });
    expect(face.readSelfieGuidance(right, 'right')).toEqual({ ok: true, messageKey: 'gotIt' });
    expect(face.readSelfieGuidance(left, 'right')).toEqual({ ok: false, messageKey: 'turnRight' });
  });

  it('treats a centred nose as no turn', () => {
    expect(face.readSelfieGuidance(resultOf(points()), 'left').messageKey).toBe('turnLeft');
  });

  it('treats a face without eye or nose landmarks as not turned', () => {
    const short = [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.85 }];
    expect(face.readSelfieGuidance(resultOf(short), 'left')).toEqual({ ok: false, messageKey: 'turnLeft' });
    expect(face.readSelfieGuidance(resultOf(short), 'right')).toEqual({ ok: false, messageKey: 'turnRight' });
  });
});
