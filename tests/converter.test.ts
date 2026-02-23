import { convert } from '../src/converter';

describe('convert', () => {
  it('should return a LarkDocument with title', () => {
    const result = convert({ markdown: '# Hello', title: 'Test' });
    expect(result.title).toBe('Test');
  });

  it('should use "Untitled" as default title', () => {
    const result = convert({ markdown: 'Hello world' });
    expect(result.title).toBe('Untitled');
  });

  it('should return content blocks', () => {
    const result = convert({ markdown: 'Some text' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].blockType).toBe('paragraph');
  });
});
