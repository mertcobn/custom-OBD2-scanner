import { describe, expect, it } from 'vitest';
import { Listeners, type Transport } from '@/obd/transport/types';
import { Elm327, ElmError, parseVersion, parseVoltage } from './elm327';

/** A scripted fake adapter: maps a command to raw output chunks. */
class FakeTransport implements Transport {
  readonly kind = 'sim' as const;
  readonly deviceName = 'fake';
  data = new Listeners<[string]>();
  close = new Listeners<[Error | undefined]>();
  written: string[] = [];
  constructor(private script: (cmd: string) => string[] | undefined) {}
  async connect() {}
  async disconnect() {
    this.close.emit(undefined);
  }
  async write(text: string) {
    const cmd = text.replace(/\r$/, '');
    this.written.push(cmd);
    const chunks = this.script(cmd);
    if (chunks) setTimeout(() => chunks.forEach((c) => this.data.emit(c)), 1);
  }
  onData(cb: (c: string) => void) {
    return this.data.add(cb);
  }
  onClose(cb: (e?: Error) => void) {
    return this.close.add(cb);
  }
}

describe('Elm327 driver', () => {
  it('strips echo and reassembles fragmented output', async () => {
    const t = new FakeTransport((cmd) => (cmd === '010C' ? ['010', 'C\r7E8 04 4', '1 0C 1A F8\r', '\r>'] : undefined));
    const elm = new Elm327(t);
    expect(await elm.send('010C')).toEqual(['7E8 04 41 0C 1A F8']);
  });

  it('drops SEARCHING... and maps status words to errors', async () => {
    const t = new FakeTransport((cmd) =>
      cmd === '0100' ? ['SEARCHING...\r7E8 06 41 00 BE 3F A8 13\r\r>'] : cmd === '0105' ? ['NO DATA\r\r>'] : ['UNABLE TO CONNECT\r\r>'],
    );
    const elm = new Elm327(t);
    expect(await elm.send('0100')).toEqual(['7E8 06 41 00 BE 3F A8 13']);
    await expect(elm.send('0105')).rejects.toMatchObject({ code: 'noData' });
    await expect(elm.send('0101')).rejects.toMatchObject({ code: 'unableToConnect' });
  });

  it('serialises concurrent commands', async () => {
    const t = new FakeTransport((cmd) => [`${cmd}-ok\r\r>`]);
    const elm = new Elm327(t);
    const results = await Promise.all(['A', 'B', 'C'].map((c) => elm.send(c)));
    expect(results).toEqual([['A-ok'], ['B-ok'], ['C-ok']]);
    expect(t.written).toEqual(['A', 'B', 'C']);
  });

  it('times out and discards the late answer of the abandoned command', async () => {
    let n = 0;
    const t = new FakeTransport((cmd) => {
      n++;
      if (cmd === 'SLOW') {
        setTimeout(() => t.data.emit('LATE\r\r>'), 40);
        return [];
      }
      return [`FAST${n}\r\r>`];
    });
    const elm = new Elm327(t);
    await expect(elm.send('SLOW', { timeoutMs: 10 })).rejects.toBeInstanceOf(ElmError);
    await new Promise((r) => setTimeout(r, 60));
    expect(await elm.send('X')).toEqual(['FAST2']);
  });

  it('treats "?" on AT commands as optional', async () => {
    const t = new FakeTransport(() => ['?\r\r>']);
    const elm = new Elm327(t);
    expect(await elm.at('ATAT1')).toBeUndefined();
  });

  it('rejects pending commands when the transport closes', async () => {
    const t = new FakeTransport(() => undefined);
    const elm = new Elm327(t);
    const p = elm.send('0100', { timeoutMs: 1000 });
    await new Promise((r) => setTimeout(r, 5));
    await t.disconnect();
    await expect(p).rejects.toMatchObject({ code: 'closed' });
  });

  it('parses version and voltage', () => {
    expect(parseVersion(['', 'ELM327 v1.5'])).toBe('ELM327 v1.5');
    expect(parseVoltage(['12.6V'])).toBe(12.6);
    expect(parseVoltage(['?'])).toBeUndefined();
  });
});
