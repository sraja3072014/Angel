import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export interface HandLandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface HandTrackingFrame {
  landmarks: HandLandmarkPoint[][];
  gestures: string[];
}

export class HandTrackerService {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;
  private onDataCallback: ((frame: HandTrackingFrame) => void) | null = null;
  private lastVideoTime: number = -1;

  public async initialize(onData: (frame: HandTrackingFrame) => void): Promise<void> {
    this.onDataCallback = onData;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
    } catch (err) {
      console.warn("HandLandmarker GPU initialization fallback to CPU:", err);
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
    }
  }

  public async start(): Promise<HTMLVideoElement> {
    if (this.isRunning && this.video) return this.video;

    if (!this.landmarker) {
      await this.initialize(this.onDataCallback || (() => {}));
    }

    if (!this.video) {
      this.video = document.createElement("video");
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;
      this.video.style.transform = "scaleX(-1)"; // Mirror video
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
      audio: false,
    });

    this.video.srcObject = this.stream;
    await new Promise<void>((resolve) => {
      if (!this.video) return resolve();
      this.video.onloadeddata = () => {
        this.video?.play();
        resolve();
      };
    });

    this.isRunning = true;
    this.detectLoop();
    return this.video;
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
    this.lastVideoTime = -1;
    // Notify clear
    this.onDataCallback?.({ landmarks: [], gestures: [] });
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  private detectLoop = () => {
    if (!this.isRunning) return;

    if (this.video && this.video.readyState >= 2 && this.landmarker) {
      if (this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        const startTimeMs = performance.now();
        const results = this.landmarker.detectForVideo(this.video, startTimeMs);

        if (results && results.landmarks) {
          const gestures = this.classifyGestures(results.landmarks);
          this.onDataCallback?.({
            landmarks: results.landmarks as HandLandmarkPoint[][],
            gestures,
          });
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(this.detectLoop);
  };

  /**
   * Fast geometric gesture classifier for 21 3D landmarks
   */
  private classifyGestures(hands: any[][]): string[] {
    const gestures: string[] = [];

    hands.forEach((landmarks) => {
      if (landmarks.length < 21) return;

      const wrist = landmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const indexPip = landmarks[6];
      const middleTip = landmarks[12];
      const middlePip = landmarks[10];
      const ringTip = landmarks[16];
      const ringPip = landmarks[14];
      const pinkyTip = landmarks[20];
      const pinkyPip = landmarks[18];

      // Pinch: Thumb tip to Index tip distance
      const pinchDist = Math.hypot(
        thumbTip.x - indexTip.x,
        thumbTip.y - indexTip.y,
        thumbTip.z - indexTip.z
      );
      if (pinchDist < 0.08) {
        gestures.push("Pinch");
      }

      // Check finger extensions (distance from wrist: tip vs pip)
      const dIndexTip = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
      const dIndexPip = Math.hypot(indexPip.x - wrist.x, indexPip.y - wrist.y);
      const indexExtended = dIndexTip > dIndexPip * 1.15;

      const dMiddleTip = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
      const dMiddlePip = Math.hypot(middlePip.x - wrist.x, middlePip.y - wrist.y);
      const middleExtended = dMiddleTip > dMiddlePip * 1.15;

      const dRingTip = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
      const dRingPip = Math.hypot(ringPip.x - wrist.x, ringPip.y - wrist.y);
      const ringExtended = dRingTip > dRingPip * 1.15;

      const dPinkyTip = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y);
      const dPinkyPip = Math.hypot(pinkyPip.x - wrist.x, pinkyPip.y - wrist.y);
      const pinkyExtended = dPinkyTip > dPinkyPip * 1.15;

      // Peace Sign: Index & Middle extended; Ring & Pinky curled
      if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
        gestures.push("Peace");
      }
      // Point: Index extended; Middle, Ring, Pinky curled
      else if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        gestures.push("Point");
      }
      // Fist: All fingers curled close to palm
      else if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
        gestures.push("Fist");
      }
    });

    return Array.from(new Set(gestures));
  }
}

export const handTracker = new HandTrackerService();
