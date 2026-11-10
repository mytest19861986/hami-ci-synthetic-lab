const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const path = require('node:path');
const fs = require('node:fs');
const temp = process.env.RUNNER_TEMP;
const url = process.env.DATABASE_URL;
const file = url?.startsWith('file:') ? url.slice(5) : '';
if (process.env.SYNTHETIC_LAB !== '1' || !temp || !file || !path.isAbsolute(file) || path.normalize(file) !== file || !file.startsWith(path.resolve(temp) + path.sep) || path.basename(file) !== 'synthetic.db' || fs.realpathSync(path.dirname(file)) !== path.dirname(file) || fs.lstatSync(file).isSymbolicLink()) throw new Error('Refusing non-synthetic database configuration');
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
async function fixture() {
  const vessel = await db.vessel.create({ data: { epoch: 1, retired: false } });
  const ticket = await db.ticket.create({ data: { vesselId: vessel.id, epoch: 1, consumed: false } });
  const guard = { id: ticket.id, consumed: false, epoch: 1, vessel: { is: { retired: false, epoch: 1 } } };
  return { vessel, ticket, guard };
}
test('T01_CREATE_READ', async () => {
  const { vessel, ticket } = await fixture();
  const row = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(row.vesselId, vessel.id); assert.equal(row.epoch, 1); assert.equal(row.consumed, false);
});
test('T02_CONDITIONAL_UPDATE_MANY', async () => {
  const { ticket, guard } = await fixture();
  assert.equal((await db.ticket.updateMany({ where: guard, data: { consumed: true } })).count, 1);
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).consumed, true);
});
test('T03_RELATION_PREDICATE', async () => {
  const { ticket, guard } = await fixture();
  const negative = { ...guard, vessel: { is: { retired: true } } };
  assert.equal((await db.ticket.updateMany({ where: negative, data: { consumed: true } })).count, 0);
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).consumed, false);
  assert.equal((await db.ticket.updateMany({ where: guard, data: { consumed: true } })).count, 1);
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).consumed, true);
});
test('T04_DUPLICATE_CONSUME', async () => {
  const { ticket, guard } = await fixture();
  assert.equal((await db.ticket.updateMany({ where: guard, data: { consumed: true } })).count, 1);
  assert.equal((await db.ticket.updateMany({ where: guard, data: { consumed: true } })).count, 0);
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).consumed, true);
});
test('T05_TRANSACTION_ROLLBACK', async () => {
  const { ticket } = await fixture();
  const marker = `synthetic-${randomUUID()}`;
  await db.note.create({ data: { ticketId: ticket.id, marker } });
  const before = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  const auditBefore = await db.note.count({ where: { ticketId: ticket.id } });
  await assert.rejects(db.$transaction(async tx => {
    const changed = await tx.ticket.update({ where: { id: ticket.id }, data: { consumed: true } });
    assert.equal(changed.consumed, true);
    await tx.note.create({ data: { ticketId: ticket.id, marker } });
  }), error => error.code === 'P2002');
  assert.deepEqual(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }), before);
  assert.equal(await db.note.count({ where: { ticketId: ticket.id } }), auditBefore);
});
test('T06_VERSION_REJECTION', async () => {
  const { vessel, ticket, guard } = await fixture();
  const before = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(before.consumed, false); assert.equal(vessel.retired, false);
  await db.vessel.update({ where: { id: vessel.id }, data: { epoch: 2 } });
  assert.equal((await db.ticket.updateMany({ where: guard, data: { consumed: true } })).count, 0);
  assert.deepEqual(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }), before);
});
