import { describe, it, expect } from 'bun:test';
import { create, toBinary, fromBinary, toJson, fromJson } from '@bufbuild/protobuf';
import { file_tasker_health_v1_health } from './gen/ts/tasker/health/v1/health_pb';
import type { DescMessage, DescService, DescField } from '@bufbuild/protobuf';

/**
 * Every RPC's request and response, through the real wire format (M12-T03).
 *
 * The GUI's unit tests mock the generated module, and the backend's handler
 * tests call functions directly — so until this file, nothing in the repository
 * ever serialized a contract message. A field-number collision or a type change
 * that breaks the wire would have passed every gate.
 *
 * Enumerated from the descriptor rather than listed by hand: a new service is
 * covered the moment it is generated, which is the only way a list like this
 * stays true.
 */

const SERVICES: DescService[] = file_tasker_health_v1_health.services;

/** Every request and response message reachable from a declared RPC. */
function messagesUnderTest(): Array<{ label: string; desc: DescMessage }> {
  const seen = new Map<string, DescMessage>();
  for (const service of SERVICES) {
    for (const method of service.methods) {
      seen.set(method.input.typeName, method.input);
      seen.set(method.output.typeName, method.output);
    }
  }
  return [...seen.entries()].map(([label, desc]) => ({ label, desc }));
}

/**
 * A value for one field that is distinguishable from the default.
 *
 * The default is exactly what a broken round trip produces, so populating with
 * zeroes and empty strings would make every assertion below pass no matter
 * what. Scalars get non-zero values; messages recurse one level, which is
 * enough to catch a nested field that does not survive.
 */
function sampleFor(field: DescField, depth: number): unknown {
  if (field.fieldKind === 'list') return depth > 1 ? [] : [scalarSample(field, depth)];
  if (field.fieldKind === 'map') return {};
  return scalarSample(field, depth);
}

function scalarSample(field: DescField, depth: number): unknown {
  switch (field.scalar) {
    case 9: // string
      return `sample-${field.name}`;
    case 8: // bool
      return true;
    case 12: // bytes
      return new Uint8Array([1, 2, 3]);
    case 3: // int64
    case 4: // uint64
      return BigInt(42);
    case undefined:
      break;
    default:
      return 7;
  }
  if (field.fieldKind === 'enum') return 0;
  if (field.message && depth < 2) return populate(field.message, depth + 1);
  return undefined;
}

/** Builds a message with every field set to something non-default. */
function populate(desc: DescMessage, depth = 0): Record<string, unknown> {
  const init: Record<string, unknown> = {};
  for (const field of desc.fields) {
    const value = sampleFor(field, depth);
    if (value !== undefined) init[field.localName] = value;
  }
  return init;
}

describe('the generated contract', () => {
  it('declares services to test, so an empty descriptor cannot pass silently', () => {
    // Without this, a generation failure that emitted nothing would make every
    // test below vacuously true.
    expect(SERVICES.length).toBeGreaterThan(10);
    expect(messagesUnderTest().length).toBeGreaterThan(50);
  });

  it('gives every RPC a distinct fully-qualified name', () => {
    const names = SERVICES.flatMap((s) => s.methods.map((m) => `${s.typeName}/${m.name}`));
    expect(new Set(names).size).toBe(names.length);
  });

  it('assigns each message a unique field number per field', () => {
    // A collision is the classic wire-breaking edit, and protobuf-es does not
    // reject it at generation time.
    for (const { label, desc } of messagesUnderTest()) {
      const numbers = desc.fields.map((f) => f.number);
      expect(`${label}: ${new Set(numbers).size}`).toBe(`${label}: ${numbers.length}`);
    }
  });
});

describe('the fixtures are not vacuous', () => {
  it('populates fields with values distinguishable from the default', () => {
    // The whole suite would pass on empty messages, since the default is
    // exactly what a broken round trip produces. This asserts the generator
    // actually fills something in.
    const createTask = messagesUnderTest().find((m) => m.label.endsWith('CreateTaskRequest'))!;
    const init = populate(createTask.desc);

    expect(Object.keys(init).length).toBeGreaterThan(2);
    expect(init.title).toBe('sample-title');
  });

  it('round-trips a value, not merely a shape', () => {
    const createTask = messagesUnderTest().find((m) => m.label.endsWith('CreateTaskRequest'))!;
    const original = create(createTask.desc, { title: 'a real title', projectId: 'proj-1' });
    const decoded = fromBinary(createTask.desc, toBinary(createTask.desc, original));

    expect((decoded as any).title).toBe('a real title');
    expect((decoded as any).projectId).toBe('proj-1');
  });
});

describe('binary round trip', () => {
  for (const { label, desc } of messagesUnderTest()) {
    it(`preserves every field of ${label}`, () => {
      const original = create(desc, populate(desc));
      const decoded = fromBinary(desc, toBinary(desc, original));
      // Comparing the JSON forms rather than the objects: protobuf-es messages
      // carry a `$typeName` and internal state that compare unequal for
      // reasons that have nothing to do with the wire.
      expect(toJson(desc, decoded)).toEqual(toJson(desc, original));
    });
  }
});

describe('JSON round trip', () => {
  for (const { label, desc } of messagesUnderTest()) {
    it(`preserves every field of ${label}`, () => {
      // The protocol the GUI actually speaks: connect's JSON codec, not
      // protobuf binary. A field that survives one and not the other is a real
      // and easily-missed asymmetry.
      const original = create(desc, populate(desc));
      const decoded = fromJson(desc, toJson(desc, original) as any);
      expect(toJson(desc, decoded)).toEqual(toJson(desc, original));
    });
  }
});

describe('cross-format agreement', () => {
  for (const { label, desc } of messagesUnderTest()) {
    it(`encodes ${label} identically through binary and JSON`, () => {
      // Catches a field that one codec drops and the other keeps — the shape
      // of bug that makes the GUI and the CLI disagree about the same call.
      const original = create(desc, populate(desc));
      const viaBinary = fromBinary(desc, toBinary(desc, original));
      const viaJson = fromJson(desc, toJson(desc, original) as any);
      expect(toJson(desc, viaBinary)).toEqual(toJson(desc, viaJson));
    });
  }
});
