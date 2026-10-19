import { useCallback, useEffect, useRef, useState } from 'react';
import { sileo } from 'sileo';
import type { useWebHaptics } from 'web-haptics/react';

// Safari records mp4 only; the others prefer webm/opus.
const RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/mpeg',
];

function recordingExtension(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes('mp4')) return 'mp4';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('mpeg')) return 'mp3';
  return 'webm';
}

async function isMicrophoneDenied(): Promise<boolean> {
  // Not every browser can query the microphone permission; those just ask on record.
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return status?.state === 'denied';
  } catch {
    return false;
  }
}

// Records from the microphone and puts the transcription in the input.
export function useVoiceInput({
  setInput,
  haptics,
}: {
  setInput: (input: string) => void;
  haptics: ReturnType<typeof useWebHaptics>;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const release = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  useEffect(() => release, [release]);

  const transcribe = useCallback(
    async (audio: Blob) => {
      try {
        const formData = new FormData();
        formData.append('audio', audio, `recording.${recordingExtension(audio.type || '')}`);
        const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Transcription failed: ${response.statusText}`);
        const data = await response.json();
        if (!data.text) throw new Error('The transcription came back empty');
        setInput(data.text);
      } catch (error) {
        console.error('Error during transcription request:', error);
        haptics.trigger('error');
        sileo.error({ title: 'Failed to transcribe audio. Please try again.' });
      } finally {
        release();
      }
    },
    [setInput, haptics, release],
  );

  const startRecording = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      haptics.trigger('error');
      sileo.error({ title: 'Voice recording is not supported in this browser.' });
      return;
    }
    if (await isMicrophoneDenied()) {
      haptics.trigger('error');
      sileo.error({ title: 'Microphone access is denied. Enable it in your browser settings.' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) void transcribe(event.data);
      });
      recorder.addEventListener('error', (event) => {
        console.error('MediaRecorder error:', event);
        haptics.trigger('error');
        sileo.error({ title: 'Recording failed. Please try again or switch browser.' });
        release();
      });
      recorder.addEventListener('stop', () => stream.getTracks().forEach((track) => track.stop()));

      recorder.start();
      setIsRecording(true);
      haptics.trigger('medium');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      haptics.trigger('error');
      sileo.error({ title: 'Could not access microphone. Please allow mic permission.' });
      setIsRecording(false);
    }
  }, [haptics, release, transcribe]);

  const toggleRecording = useCallback(() => {
    if (isRecording && recorderRef.current) {
      recorderRef.current.stop();
      release();
      haptics.trigger('selection');
      return;
    }
    void startRecording();
  }, [isRecording, release, haptics, startRecording]);

  return { isRecording, toggleRecording };
}
