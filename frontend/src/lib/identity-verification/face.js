import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';

const LANDMARKER_MODEL = '/models/face_landmarker.task';

let taskPromise;

async function createLandmarker() {
  const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
  return FaceLandmarker.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
    baseOptions: { modelAssetPath: LANDMARKER_MODEL },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export function loadFaceLandmarker() {
  if (!taskPromise) {
    taskPromise = createLandmarker().catch((error) => {
      taskPromise = null;
      throw error;
    });
  }
  return taskPromise;
}

function blendScore(result, key) {
  const categories = result?.faceBlendshapes?.[0]?.categories || [];
  const match = categories.find((item) => item.categoryName === key);
  return match?.score || 0;
}

function headTurn(result) {
  const landmarks = result?.faceLandmarks?.[0];
  if (!landmarks?.length) return 0;
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  if (!leftEye || !rightEye || !nose) return 0;
  const eyeSpan = Math.max(0.001, Math.abs(rightEye.x - leftEye.x));
  const midEye = (leftEye.x + rightEye.x) / 2;
  return (nose.x - midEye) / eyeSpan;
}

function faceBox(landmarks) {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    centerX: (Math.max(...xs) + Math.min(...xs)) / 2,
    centerY: (Math.max(...ys) + Math.min(...ys)) / 2,
  };
}

export function readSelfieGuidance(result, stage) {
  const landmarks = result?.faceLandmarks?.[0];
  if (!landmarks?.length) return { ok: false, messageKey: 'noFace' };
  const box = faceBox(landmarks);
  if (box.width < 0.18 || box.height < 0.18) return { ok: false, messageKey: 'closer' };
  if (box.width > 0.62 || box.height > 0.72) return { ok: false, messageKey: 'backOff' };
  if (Math.abs(box.centerX - 0.5) > 0.12 || Math.abs(box.centerY - 0.58) > 0.16) {
    return { ok: false, messageKey: 'center' };
  }

  if (stage === 'smile') {
    const smile = Math.max(blendScore(result, 'mouthSmileLeft'), blendScore(result, 'mouthSmileRight'));
    return smile > 0.25 ? { ok: true, messageKey: 'smileOk' } : { ok: false, messageKey: 'smilePrompt' };
  }

  const turn = headTurn(result);
  if (stage === 'left') return turn > 0.08 ? { ok: true, messageKey: 'gotIt' } : { ok: false, messageKey: 'turnLeft' };
  if (stage === 'right') return turn < -0.08 ? { ok: true, messageKey: 'gotIt' } : { ok: false, messageKey: 'turnRight' };
  return { ok: true, messageKey: 'hold' };
}