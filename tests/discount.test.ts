import { describe, it, expect } from 'vitest';
import { isStudentEmail } from '@/lib/discount';

const DOMAINS = ['.edu', '.ac.in', '.edu.in'];

describe('isStudentEmail', () => {
  it('matches a plain .edu address', () => {
    expect(isStudentEmail('a@mit.edu', DOMAINS)).toBe(true);
  });

  it('matches .edu.<cc> country variants via the special case', () => {
    expect(isStudentEmail('a@uni.edu.au', DOMAINS)).toBe(true);
  });

  it('matches other suffix patterns exactly', () => {
    expect(isStudentEmail('a@iit.ac.in', DOMAINS)).toBe(true);
    expect(isStudentEmail('a@school.edu.in', DOMAINS)).toBe(true);
  });

  it('rejects non-student domains', () => {
    expect(isStudentEmail('a@gmail.com', DOMAINS)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isStudentEmail('Student@MIT.EDU', DOMAINS)).toBe(true);
  });

  it('rejects a domain that merely contains .edu mid-string', () => {
    expect(isStudentEmail('a@edu.example.com', DOMAINS)).toBe(false);
  });

  it('rejects malformed and empty inputs', () => {
    expect(isStudentEmail('', DOMAINS)).toBe(false);
    expect(isStudentEmail('no-at-sign', DOMAINS)).toBe(false);
    expect(isStudentEmail('a@b@c.edu', DOMAINS)).toBe(false);
    // @ts-expect-error exercising the runtime guard
    expect(isStudentEmail(null, DOMAINS)).toBe(false);
  });

  it('returns false when the domain list is empty', () => {
    expect(isStudentEmail('a@mit.edu', [])).toBe(false);
  });
});
