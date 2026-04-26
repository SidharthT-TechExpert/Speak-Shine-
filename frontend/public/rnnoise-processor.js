/**
 * RNNoise AudioWorkletProcessor
 * Runs in the audio worklet thread — processes 480-sample frames through RNNoise.
 * The main thread posts { type: "init", wasmBinary } to start it up.
 */

const FRAME_SIZE = 480; // RNNoise requires exactly 480 samples per frame

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ready    = false;
    this._module   = null;
    this._st       = null;       // RNNoise state pointer
    this._inBuf    = null;       // Float32 heap input
    this._outBuf   = null;       // Float32 heap output
    this._inPtr    = 0;
    this._outPtr   = 0;
    this._leftover = new Float32Array(0); // samples waiting for a full frame

    this.port.onmessage = async (e) => {
      if (e.data?.type === "init") {
        try {
          // Instantiate the WASM module from the binary sent by the main thread
          const result = await WebAssembly.instantiate(e.data.wasmBinary, {});
          this._module = result.instance.exports;

          // Allocate input/output buffers on the WASM heap
          this._inPtr  = this._module.malloc(FRAME_SIZE * 4);
          this._outPtr = this._module.malloc(FRAME_SIZE * 4);
          this._inBuf  = new Float32Array(this._module.memory.buffer, this._inPtr,  FRAME_SIZE);
          this._outBuf = new Float32Array(this._module.memory.buffer, this._outPtr, FRAME_SIZE);

          // Create RNNoise state
          this._st = this._module.rnnoise_create(0);
          this._ready = true;
          this.port.postMessage({ type: "ready" });
        } catch (err) {
          this.port.postMessage({ type: "error", message: err.message });
        }
      }
    };
  }

  process(inputs, outputs) {
    const input  = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    if (!this._ready) {
      // Pass through unprocessed until WASM is ready
      output.set(input);
      return true;
    }

    // Accumulate samples — RNNoise needs exactly 480 at a time
    const combined = new Float32Array(this._leftover.length + input.length);
    combined.set(this._leftover);
    combined.set(input, this._leftover.length);

    let offset = 0;
    const processed = new Float32Array(combined.length);

    while (offset + FRAME_SIZE <= combined.length) {
      // Scale to int16 range that RNNoise expects
      for (let i = 0; i < FRAME_SIZE; i++) {
        this._inBuf[i] = combined[offset + i] * 32768;
      }

      this._module.rnnoise_process_frame(this._st, this._outPtr, this._inPtr);

      // Scale back to float32
      for (let i = 0; i < FRAME_SIZE; i++) {
        processed[offset + i] = this._outBuf[i] / 32768;
      }
      offset += FRAME_SIZE;
    }

    // Save leftover samples for next call
    this._leftover = combined.slice(offset);

    // Copy processed samples to output (may be shorter than input on first frames)
    const copyLen = Math.min(processed.length, output.length);
    output.set(processed.subarray(0, copyLen));

    return true;
  }
}

registerProcessor("rnnoise-processor", RNNoiseProcessor);
