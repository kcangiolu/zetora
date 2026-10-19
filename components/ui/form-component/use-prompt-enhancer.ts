import { useCallback, useEffect, useRef, useState } from 'react';
import { sileo } from 'sileo';
import type { useWebHaptics } from 'web-haptics/react';

import { enhancePrompt } from '@/app/actions';

interface TypewriterProgress {
  target: string;
  index: number;
  speed: number;
}

// Kept at module level so a transient remount of the composer resumes typing the
// enhanced prompt instead of dropping it.
let pendingTypewriterResume: TypewriterProgress | null = null;

// Rewrites the prompt with the enhance model, then types the result into the input.
export function usePromptEnhancer({
  input,
  setInput,
  inputRef,
  isProcessing,
  haptics,
}: {
  input: string;
  setInput: (input: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isProcessing: boolean;
  haptics: ReturnType<typeof useWebHaptics>;
}) {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isTypewriting, setIsTypewriting] = useState(false);
  const isMounted = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<string | null>(null);
  const speedRef = useRef(5);
  const setInputRef = useRef(setInput);
  const latestInputRef = useRef(input);

  useEffect(() => {
    setInputRef.current = setInput;
    latestInputRef.current = input;
  });

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (targetRef.current) {
        const target = targetRef.current;
        pendingTypewriterResume = {
          target,
          index: Math.min(target.length, Math.max(latestInputRef.current.length, 1)),
          speed: speedRef.current,
        };
        targetRef.current = null;
      }
    };
  }, []);

  const typewrite = useCallback(
    (text: string, speed: number = 5, startIndex?: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      speedRef.current = speed;
      targetRef.current = text;

      const finish = () => {
        timeoutRef.current = null;
        targetRef.current = null;
        pendingTypewriterResume = null;
        setIsTypewriting(false);
      };
      if (!text) {
        finish();
        return;
      }

      // Never starts from an empty input, which would read as the prompt being cleared.
      let index = Math.min(text.length, Math.max(startIndex ?? 1, 1));
      setIsTypewriting(index < text.length);
      setInputRef.current(text.slice(0, index));
      pendingTypewriterResume = { target: text, index, speed };

      const typeNext = () => {
        if (!isMounted.current) return;
        if (index < text.length) {
          index++;
          setInputRef.current(text.slice(0, index));
          pendingTypewriterResume = { target: text, index, speed };
          timeoutRef.current = setTimeout(typeNext, speed);
          return;
        }
        finish();
        inputRef.current?.focus();
      };

      if (index >= text.length) {
        finish();
        inputRef.current?.focus();
        return;
      }
      timeoutRef.current = setTimeout(typeNext, speed);
    },
    [inputRef],
  );

  useEffect(() => {
    const resume = pendingTypewriterResume;
    if (!resume) return;
    pendingTypewriterResume = null;
    const currentInput = latestInputRef.current;
    if (!resume.target.startsWith(currentInput)) return;
    typewrite(
      resume.target,
      resume.speed,
      Math.min(resume.target.length, Math.max(resume.index, currentInput.length, 1)),
    );
  }, [typewrite]);

  const enhance = useCallback(async () => {
    if (!input.trim()) {
      haptics.trigger('error');
      sileo.error({ title: 'Please enter a prompt to enhance' });
      return;
    }
    if (isProcessing || isEnhancing) return;

    const originalInput = input;
    setIsEnhancing(true);

    const enhanceAsync = async () => {
      const result = await enhancePrompt(input);
      if (result?.success && result.enhanced) {
        typewrite(result.enhanced);
        setIsEnhancing(false);
        haptics.trigger('success');
        return result;
      }
      throw new Error(result?.error || 'Failed to enhance prompt');
    };

    sileo.promise(
      enhanceAsync().catch((e) => {
        setInput(originalInput);
        setIsEnhancing(false);
        haptics.trigger('error');
        throw e;
      }),
      {
        loading: { title: 'Enhancing your prompt...' },
        success: () => ({ title: 'Prompt enhanced successfully!' }),
        error: (err) => ({ title: (err as Error).message }),
      },
    );
  }, [input, haptics, isProcessing, setInput, typewrite, isEnhancing]);

  return { isEnhancing, isTypewriting, enhance };
}
