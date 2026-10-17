import { describe, expect, it } from 'vitest';

import {
  Factory,
  FactoryId,
  IncompatibleUnitError,
  InvalidLocationKindError,
  InvalidStateTransitionError,
  Location,
  Machine,
  Material,
  Worker,
} from '../../index.js';

describe('Factory', () => {
  it('create genera id y conserva el nombre', () => {
    const factory = Factory.create({ name: 'Planta Norte' });
    expect(factory.name).toBe('Planta Norte');
    expect(typeof factory.id).toBe('string');
    expect(Object.isFrozen(factory)).toBe(true);
  });

  it('fromPersistence reconstituye el id', () => {
    const id = FactoryId.from('factory-1');
    const factory = Factory.fromPersistence({ id, name: 'Planta Sur' });
    expect(factory.id).toBe(id);
    expect(factory.name).toBe('Planta Sur');
  });
});

describe('Material', () => {
  it('acepta una unidad coherente con el estado físico', () => {
    const material = Material.create({
      name: 'Harina',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    });
    expect(material.kind).toBe('supply');
    expect(material.physicalState).toBe('solid');
    expect(material.unitOfMeasure).toBe('kg');
    expect(Object.isFrozen(material)).toBe(true);
  });

  it('rechaza una unidad incoherente con el estado físico (I6)', () => {
    expect(() =>
      Material.create({
        name: 'Leche',
        kind: 'supply',
        physicalState: 'liquid',
        unitOfMeasure: 'kg',
      }),
    ).toThrow(IncompatibleUnitError);
  });

  it('reporta el estado físico en el error de unidad incompatible', () => {
    try {
      Material.create({
        name: 'Piezas',
        kind: 'product',
        physicalState: 'gas',
        unitOfMeasure: 'unit',
      });
      throw new Error('debería haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(IncompatibleUnitError);
      expect((error as IncompatibleUnitError).physicalState).toBe('gas');
      expect((error as IncompatibleUnitError).received).toBe('unit');
    }
  });

  it('fromPersistence valida y conserva el id', () => {
    const id = Material.create({ name: 'X', kind: 'product', physicalState: 'gas', unitOfMeasure: 'm3' }).id;
    const material = Material.fromPersistence({
      id,
      name: 'Gas',
      kind: 'product',
      physicalState: 'gas',
      unitOfMeasure: 'm3',
    });
    expect(material.id).toBe(id);
  });

  it('arranca activo y deactivate/activate devuelven instancias nuevas e idempotentes', () => {
    const material = Material.create({
      name: 'Harina',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
    });
    expect(material.active).toBe(true);

    const inactive = material.deactivate();
    expect(inactive.active).toBe(false);
    expect(material.active).toBe(true); // inmutable
    expect(inactive.deactivate()).toBe(inactive);
    expect(inactive.activate().active).toBe(true);
    expect(material.activate()).toBe(material);
  });

  it('fromPersistence conserva active', () => {
    const material = Material.fromPersistence({
      id: Material.create({ name: 'X', kind: 'supply', physicalState: 'solid', unitOfMeasure: 'kg' }).id,
      name: 'Harina',
      kind: 'supply',
      physicalState: 'solid',
      unitOfMeasure: 'kg',
      active: false,
    });
    expect(material.active).toBe(false);
  });
});

describe('Location', () => {
  it('crea lugares de producción y almacenamiento', () => {
    expect(Location.create({ name: 'Sala 1', kind: 'production' }).kind).toBe('production');
    expect(Location.create({ name: 'Depósito', kind: 'storage' }).kind).toBe('storage');
  });
});

describe('Machine', () => {
  const production = Location.create({ name: 'Sala 1', kind: 'production' });
  const storage = Location.create({ name: 'Depósito', kind: 'storage' });

  it('create arranca en idle', () => {
    const machine = Machine.create({ name: 'Mezcladora', type: 'mixer', locationId: production.id });
    expect(machine.status).toBe('idle');
    expect(machine.type).toBe('mixer');
    expect(Object.isFrozen(machine)).toBe(true);
  });

  it('moveTo un lugar de producción actualiza locationId (I2)', () => {
    const other = Location.create({ name: 'Sala 2', kind: 'production' });
    const machine = Machine.create({ name: 'Mezcladora', type: 'mixer', locationId: production.id });
    const moved = machine.moveTo(other);
    expect(moved.locationId).toBe(other.id);
    expect(machine.locationId).toBe(production.id); // inmutable
    expect(moved.id).toBe(machine.id);
  });

  it('moveTo un lugar de almacenamiento se rechaza (I2)', () => {
    const machine = Machine.create({ name: 'Mezcladora', type: 'mixer', locationId: production.id });
    expect(() => machine.moveTo(storage)).toThrow(InvalidLocationKindError);
  });

  it('permite las transiciones idle ⇄ running y idle → maintenance → idle', () => {
    const machine = Machine.create({ name: 'Horno', type: 'oven', locationId: production.id });
    const running = machine.start();
    expect(running.status).toBe('running');
    expect(running.stop().status).toBe('idle');
    expect(machine.startMaintenance().finishMaintenance().status).toBe('idle');
  });

  it('rechaza transiciones inválidas', () => {
    const machine = Machine.create({ name: 'Horno', type: 'oven', locationId: production.id });
    expect(() => machine.stop()).toThrow(InvalidStateTransitionError);
    expect(() => machine.startMaintenance()).not.toThrow();
    expect(() => machine.start().start()).toThrow(InvalidStateTransitionError);
  });
});

describe('Worker', () => {
  it('create arranca activo y expone helpers de rol', () => {
    const admin = Worker.create({ name: 'Ana', role: 'admin' });
    expect(admin.active).toBe(true);
    expect(admin.isAdmin()).toBe(true);
    expect(admin.isWorker()).toBe(false);
    expect(admin.isAuditor()).toBe(false);
    expect(Object.isFrozen(admin)).toBe(true);
  });

  it('deactivate/activate devuelven instancias nuevas e idempotentes', () => {
    const worker = Worker.create({ name: 'Beto', role: 'worker' });
    const inactive = worker.deactivate();
    expect(inactive.active).toBe(false);
    expect(worker.active).toBe(true);
    expect(inactive.deactivate()).toBe(inactive);
    expect(inactive.activate().active).toBe(true);
    expect(worker.activate()).toBe(worker);
  });
});
