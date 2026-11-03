export interface SseFrame {
  id?: string;
  event?: string;
  data: string;
}

/**
 * Incremental Server-Sent Events parser (WHATWG event-stream format).
 * Feed it decoded text chunks; it returns completed frames. Comments (": ping") are ignored.
 */
export class SseParser {
  private buffer = '';

  push(chunk: string): SseFrame[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const frames: SseFrame[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const frame: SseFrame = { data: '' };
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'data') data.push(value);
        else if (field === 'event') frame.event = value;
        else if (field === 'id') frame.id = value;
      }
      if (data.length > 0) {
        frame.data = data.join('\n');
        frames.push(frame);
      }
    }
    return frames;
  }
}
