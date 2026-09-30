import { describe, expect, it } from 'vitest';
import { parseArduinoSerialLine, serialLineToDrainReading } from '../src/serial.js';

describe('parseArduinoSerialLine', () => {
  it('parses the reference line DRAIN001,78', () => {
    expect(parseArduinoSerialLine('DRAIN001,78')).toEqual({ device_code: 'DRAIN-001', value: 78 });
  });

  it('tolerates CRLF from the serial port and decimals', () => {
    expect(parseArduinoSerialLine('DRAIN004,12.5\r\n')).toEqual({
      device_code: 'DRAIN-004',
      value: 12.5,
    });
  });

  it.each([
    '',
    'DRAIN001',
    'DRAIN1,78',
    'drain001,78',
    'DRAIN001,abc',
    'DRAIN001,101',
    'DRAIN001,-5',
  ])('rejects %j', (line) => {
    expect(parseArduinoSerialLine(line)).toBeNull();
  });
});

describe('serialLineToDrainReading', () => {
  it('builds the gateway JSON payload', () => {
    const at = new Date('2026-09-29T15:30:00Z');
    expect(serialLineToDrainReading('DRAIN001,78', at)).toEqual({
      device_code: 'DRAIN-001',
      value: 78,
      unit: 'percent',
      recorded_at: '2026-09-29T15:30:00.000Z',
    });
  });
});
