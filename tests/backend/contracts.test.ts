import { expect, it } from 'vitest';
import { MockSetupSchema } from '../../shared/contracts.js';

const base = { durationMinutes: 30, topicWeights: { 'js-fundamentals': 1 }, difficulty: { easy: 1, medium: 0, hard: 0 } };

it('parses legacy mock configs, filling empty company and CV defaults', () => {
  const setup = MockSetupSchema.parse(base);
  expect(setup).toEqual({
    ...base, companyName: '', jobRole: '', companyInfo: '', cvFileName: '', cvText: '', cvSituational: true,
  });
});

it('trims company name, role and CV fields but preserves pasted company info verbatim', () => {
  const setup = MockSetupSchema.parse({
    ...base, companyName: '  Acme  ', jobRole: ' Frontend Engineer ', companyInfo: '  pasted notes  ',
    cvFileName: ' cv.pdf ', cvText: ' Senior frontend developer. ',
  });
  expect(setup.companyName).toBe('Acme');
  expect(setup.jobRole).toBe('Frontend Engineer');
  expect(setup.companyInfo).toBe('  pasted notes  ');
  expect(setup.cvFileName).toBe('cv.pdf');
  expect(setup.cvText).toBe('Senior frontend developer.');
});

it('rejects over-long company and CV fields and unknown keys', () => {
  const cases = [
    { companyName: 'a'.repeat(101) }, { jobRole: 'a'.repeat(101) }, { companyInfo: 'a'.repeat(8_001) },
    { cvFileName: 'a'.repeat(256) }, { cvText: 'a'.repeat(30_001) }, { cvSituational: 'yes' }, { companyWebsite: 'https://acme.test' },
  ];
  for (const field of cases) expect(() => MockSetupSchema.parse({ ...base, ...field })).toThrow();
});

it('still requires a positive topic weight and a positive difficulty mix', () => {
  expect(() => MockSetupSchema.parse({ ...base, topicWeights: { 'js-fundamentals': 0 } })).toThrow(/Select a topic/);
  expect(() => MockSetupSchema.parse({ ...base, difficulty: { easy: 0, medium: 0, hard: 0 } })).toThrow(/positive/);
});
