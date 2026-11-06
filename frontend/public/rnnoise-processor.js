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

    // FIFO ring buffers to bridge WebAudio 128-sample quanta with RNNoise 480-sample frames
    // Capacity 4096 is ~85ms at 48kHz, more than enough to handle burst cycles without loss
    this._inputBuf  = new Float32Array(4096);
    this._inputLen  = 0;
    this._outputBuf = new Float32Array(4096);
    this._outputLen = 0;

    this.port.onmessage = async (e) => {
      if (e.data?.type === "init") {
        try {
          // Instantiate the WASM module from the binary sent by the main thread
          const importObject = {
            a: {},        // @jitsi/rnnoise-wasm uses "a" as import namespace
            env: {},
            wasi_snapshot_preview1: {},
          };
          const result = await WebAssembly.instantiate(e.data.wasmBinary, importObject);
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

    const quantum = input.length; // 128 samples

    // 1. Accumulate incoming samples into input FIFO buffer
    if (this._inputLen + quantum <= this._inputBuf.length) {
      this._inputBuf.set(input, this._inputLen);
      this._inputLen += quantum;
    } else {
      // Emergency overflow guard: keep the latest audio
      const keep = this._inputBuf.length - quantum;
      this._inputBuf.copyWithin(0, this._inputLen - keep, this._inputLen);
      this._inputLen = keep;
      this._inputBuf.set(input, this._inputLen);
      this._inputLen += quantum;
    }

    // 2. Process all complete 480-sample frames through RNNoise
    while (this._inputLen >= FRAME_SIZE) {
      // Copy 480 samples to WASM heap (scale to int16 range)
      for (let i = 0; i < FRAME_SIZE; i++) {
        this._inBuf[i] = this._inputBuf[i] * 32768;
      }

      this._module.rnnoise_process_frame(this._st, this._outPtr, this._inPtr);

      // Shift input FIFO by FRAME_SIZE
      this._inputBuf.copyWithin(0, FRAME_SIZE, this._inputLen);
      this._inputLen -= FRAME_SIZE;

      // Push 480 denoised samples into output FIFO (scale back to float32)
      if (this._outputLen + FRAME_SIZE <= this._outputBuf.length) {
        for (let i = 0; i < FRAME_SIZE; i++) {
          this._outputBuf[this._outputLen + i] = this._outBuf[i] / 32768;
        }
        this._outputLen += FRAME_SIZE;
      }
    }

    // 3. Deliver exactly quantum (128) samples from output FIFO to WebAudio output
    if (this._outputLen >= quantum) {
      output.set(this._outputBuf.subarray(0, quantum));
      this._outputBuf.copyWithin(0, quantum, this._outputLen);
      this._outputLen -= quantum;
    } else {
      // Initial buffer filling (~8-10ms warmup): pass through clean input with zero silence
      output.set(input);
    }

    return true;
  }
}

registerProcessor("rnnoise-processor", RNNoiseProcessor);
