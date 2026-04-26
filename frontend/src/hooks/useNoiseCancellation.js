/**
 * useNoiseCancellation
 *
 * Takes a raw MediaStream (with audio + video) and returns a new MediaStream
 * where the audio track has been routed through RNNoise WASM for AI noise removal.
 * The video track is passed through unchanged.
 *
 * Falls back to the original stream if WASM fails to load.
 *
 * Usage:
 *   const { applyNoiseCancellation, cleanupNC } = useNoiseCancellation();
 *   const cleanStream = await applyNoiseCancellation(rawStream);
 */

import { useRef, useCallback } from "react";

export function useNoiseCancellation() {
  const audioCtxRef    = useRef(null);
  const workletNodeRef = useRef(null);
  const destNodeRef    = useRef(null);

  const cleanupNC = useCallback(() => {
    try {
      workletNodeRef.current?.disconnect();
      destNodeRef.current?.disconnect();
      audioCtxRef.current?.close();
    } catch {}
    workletNodeRef.current = null;
    destNodeRef.current    = null;
    audioCtxRef.current    = null;
  }, []);

  /**
   * @param {MediaStream} rawStream  — stream from getUserMedia
   * @returns {Promise<MediaStream>} — stream with clean audio + original video
   */
  const applyNoiseCancellation = useCallback(async (rawStream) => {
    try {
      // 1. Create AudioContext at 48kHz (matches getUserMedia sampleRate)
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;

      // 2. Load the AudioWorklet processor
      await audioCtx.audioWorklet.addModule("/rnnoise-processor.js");

      // 3. Fetch the RNNoise WASM binary from public folder
      const wasmResp   = await fetch("/rnnoise.wasm");
      const wasmBinary = await wasmResp.arrayBuffer();

      // 4. Create the worklet node and send the WASM binary to it
      const workletNode = new AudioWorkletNode(audioCtx, "rnnoise-processor", {
        numberOfInputs:  1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      workletNodeRef.current = workletNode;

      // Wait for the worklet to signal it's ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("RNNoise init timeout")), 5000);
        workletNode.port.onmessage = (e) => {
          if (e.data?.type === "ready")  { clearTimeout(timeout); resolve(); }
          if (e.data?.type === "error")  { clearTimeout(timeout); reject(new Error(e.data.message)); }
        };
        workletNode.port.postMessage({ type: "init", wasmBinary });
      });

      // 5. Wire: microphone source → worklet → destination stream
      const source = audioCtx.createMediaStreamSource(rawStream);
      const dest   = audioCtx.createMediaStreamDestination();
      destNodeRef.current = dest;

      source.connect(workletNode);
      workletNode.connect(dest);

      // 6. Build the final stream: clean audio + original video tracks
      const cleanAudioTrack = dest.stream.getAudioTracks()[0];
      const videoTracks     = rawStream.getVideoTracks();
      const finalStream     = new MediaStream([cleanAudioTrack, ...videoTracks]);

      console.log("[NoiseCancellation] RNNoise WASM active ✓");
      return finalStream;

    } catch (err) {
      console.warn("[NoiseCancellation] RNNoise failed, using raw stream:", err.message);
      cleanupNC();
      return rawStream; // graceful fallback
    }
  }, [cleanupNC]);

  return { applyNoiseCancellation, cleanupNC };
}
