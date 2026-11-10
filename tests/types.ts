import { Prisma } from '@prisma/client';

// These declarations are checked against the generated client in future CI.
const predicate: Prisma.TicketWhereInput = {
  consumed: false,
  vessel: { is: { retired: false, epoch: 1 } },
};
const update: Prisma.TicketUpdateManyMutationInput = { consumed: true };
void predicate;
void update;
