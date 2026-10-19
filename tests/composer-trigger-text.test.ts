import { describe, it, expect } from 'vitest';

import { findActiveTrigger, replaceTriggerText } from '@/components/ui/form-component/trigger-text';

describe('findActiveTrigger', () => {
  it('finds a trigger at the start or after whitespace', () => {
    expect(findActiveTrigger('/can', 4)).toEqual({ trigger: '/', position: 0, filter: 'can' });
    expect(findActiveTrigger('hello @we', 9)).toEqual({ trigger: '@', position: 6, filter: 'we' });
  });

  it('ignores a trigger inside a word or before a space', () => {
    expect(findActiveTrigger('mail me@home', 12)).toBeNull();
    expect(findActiveTrigger('/canvas now', 11)).toBeNull();
    expect(findActiveTrigger('a/b', 3)).toBeNull();
  });

  it('reads only up to the cursor', () => {
    expect(findActiveTrigger('@web more', 4)).toEqual({ trigger: '@', position: 0, filter: 'web' });
  });
});

describe('replaceTriggerText', () => {
  it('strips the trigger and its filter', () => {
    expect(replaceTriggerText('compare /can', 12, '/')).toEqual({ value: 'compare ', cursor: 8 });
    expect(replaceTriggerText('/can rest', 4, '/')).toEqual({ value: 'rest', cursor: 0 });
  });

  it('inserts a command in place of the trigger', () => {
    expect(replaceTriggerText('/mo', 3, '/', '/model ')).toEqual({ value: '/model ', cursor: 7 });
  });

  it('leaves the input alone when the cursor is past a space', () => {
    expect(replaceTriggerText('/model x', 8, '/')).toBeNull();
  });
});
