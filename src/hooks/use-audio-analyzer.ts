"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export function useAudioAnalyzer() {
  const [amplitude, setAmplitude] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const getContext = useCallback(() => {
    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  }, []);

  const startLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !dataRef.current) return;

    const tick = () => {
      analyser.getByteTimeDomainData(dataRef.current!);
      let sum = 0;
      for (let i = 0; i < dataRef.current!.length; i++) {
        const v = (dataRef.current![i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataRef.current!.length);
      setAmplitude(Math.min(1, rms * 3));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const connectStream = useCallback(
    (stream: MediaStream) => {
      const ctx = getContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      startLoop();
    },
    [getContext, startLoop]
  );

  const connectElement = useCallback(
    (el: HTMLAudioElement) => {
      const ctx = getContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

      const source = ctx.createMediaElementSource(el);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;
      startLoop();
    },
    [getContext, startLoop]
  );

  const disconnect = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    setAmplitude(0);
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      contextRef.current?.close();
    };
  }, []);

  return { amplitude, connectStream, connectElement, disconnect };
}
