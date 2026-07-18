import { buildNote } from '../../../../../../src/databox/cms/modules/social/Note';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildNote', (): void => {
  it('builds a minimal ActivityStreams Note.', (): void => {
    const note = buildNote({
      id: 'https://example.org/notes/1',
      author: 'https://example.org/profile/card#me',
      content: 'Hello, world!',
      published: '2026-07-19T12:00:00Z',
    });
    expect(note['@context']).toBe('https://www.w3.org/ns/activitystreams');
    expect(note['@type']).toBe('Note');
    expect(note['@id']).toBe('https://example.org/notes/1');
    expect(record(note.attributedTo)['@id']).toBe('https://example.org/profile/card#me');
    expect(note.content).toBe('Hello, world!');
    expect(note.published).toBe('2026-07-19T12:00:00Z');
    expect(note.inReplyTo).toBeUndefined();
  });

  it('includes inReplyTo when supplied.', (): void => {
    const note = buildNote({
      id: 'https://example.org/notes/2',
      author: 'https://example.org/profile/card#me',
      content: 'A reply.',
      published: '2026-07-19T12:05:00Z',
      inReplyTo: 'https://example.org/notes/1',
    });
    expect(record(note.inReplyTo)['@id']).toBe('https://example.org/notes/1');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildNote({
      id: 'not-a-uri',
      author: 'https://example.org/profile/card#me',
      content: 'Hello, world!',
      published: '2026-07-19T12:00:00Z',
    })).toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI author.', (): void => {
    expect((): unknown => buildNote({
      id: 'https://example.org/notes/1',
      author: 'not-a-uri',
      content: 'Hello, world!',
      published: '2026-07-19T12:00:00Z',
    })).toThrow('author must be an absolute URI');
  });

  it('rejects empty content.', (): void => {
    expect((): unknown => buildNote({
      id: 'https://example.org/notes/1',
      author: 'https://example.org/profile/card#me',
      content: ' ',
      published: '2026-07-19T12:00:00Z',
    })).toThrow('content');
  });

  it('rejects empty published.', (): void => {
    expect((): unknown => buildNote({
      id: 'https://example.org/notes/1',
      author: 'https://example.org/profile/card#me',
      content: 'Hello, world!',
      published: ' ',
    })).toThrow('published date');
  });
});
