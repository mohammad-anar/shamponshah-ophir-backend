import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';

export type ActorRole = Role | 'SYSTEM';

export interface StateTransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  allowedRoles: ActorRole[];
  description: string;
}

/**
 * ─────────────────────────────────────────────────────────────
 * ORDER STATE MACHINE TABLE
 * ─────────────────────────────────────────────────────────────
 * Centralized matrix defining every legal order status transition
 * and which actor role (CLIENT, VENDOR, ADMIN, SYSTEM) is authorized
 * to initiate it. Enforced across the entire platform.
 */
export const ORDER_STATE_MACHINE_TABLE: StateTransitionRule[] = [
  // 1. PENDING_PAYMENT -> ACTIVE: Client deposits escrow funds via Stripe
  {
    from: OrderStatus.PENDING_PAYMENT,
    to: OrderStatus.ACTIVE,
    allowedRoles: [Role.CLIENT, 'SYSTEM', Role.ADMIN],
    description: 'Order payment funded in escrow vault',
  },
  // 2. PENDING_PAYMENT -> CANCELLED: Abandoned or rejected prior to funding
  {
    from: OrderStatus.PENDING_PAYMENT,
    to: OrderStatus.CANCELLED,
    allowedRoles: [Role.CLIENT, Role.ADMIN, 'SYSTEM'],
    description: 'Order cancelled before payment was deposited',
  },

  // 3. ACTIVE -> DELIVERED: Vendor finishes work and delivers
  {
    from: OrderStatus.ACTIVE,
    to: OrderStatus.DELIVERED,
    allowedRoles: [Role.VENDOR, Role.ADMIN],
    description: 'Vendor marked order as delivered with proof/deliverables',
  },
  // 4. ACTIVE -> CANCELLED: Mutual cancellation or admin void before delivery
  {
    from: OrderStatus.ACTIVE,
    to: OrderStatus.CANCELLED,
    allowedRoles: [Role.ADMIN, Role.CLIENT],
    description: 'Active order cancelled and refunded to client',
  },
  // 5. ACTIVE -> DISPUTED: Issue raised during execution
  {
    from: OrderStatus.ACTIVE,
    to: OrderStatus.DISPUTED,
    allowedRoles: [Role.CLIENT, Role.VENDOR, Role.ADMIN],
    description: 'Dispute opened during active order progress',
  },

  // 6. DELIVERED -> COMPLETED: Client approves delivery or auto-completed
  {
    from: OrderStatus.DELIVERED,
    to: OrderStatus.COMPLETED,
    allowedRoles: [Role.CLIENT, 'SYSTEM', Role.ADMIN],
    description: 'Client approved deliverables, order completed and sent to clearing',
  },
  // 7. DELIVERED -> REVISION_REQUESTED: Client requests changes
  {
    from: OrderStatus.DELIVERED,
    to: OrderStatus.REVISION_REQUESTED,
    allowedRoles: [Role.CLIENT, Role.ADMIN],
    description: 'Client requested revisions on delivered work',
  },
  // 8. DELIVERED -> DISPUTED: Escalation on delivery dissatisfaction
  {
    from: OrderStatus.DELIVERED,
    to: OrderStatus.DISPUTED,
    allowedRoles: [Role.CLIENT, Role.ADMIN],
    description: 'Dispute opened over delivery',
  },

  // 9. REVISION_REQUESTED -> DELIVERED: Vendor re-delivers after revisions
  {
    from: OrderStatus.REVISION_REQUESTED,
    to: OrderStatus.DELIVERED,
    allowedRoles: [Role.VENDOR, Role.ADMIN],
    description: 'Vendor re-delivered work after completing requested revisions',
  },
  // 10. REVISION_REQUESTED -> DISPUTED: Impasse on revisions
  {
    from: OrderStatus.REVISION_REQUESTED,
    to: OrderStatus.DISPUTED,
    allowedRoles: [Role.CLIENT, Role.VENDOR, Role.ADMIN],
    description: 'Dispute opened over unresolved revision requests',
  },

  // 11. DISPUTED -> COMPLETED: Admin decides in vendor favor (100% release)
  {
    from: OrderStatus.DISPUTED,
    to: OrderStatus.COMPLETED,
    allowedRoles: [Role.ADMIN],
    description: 'Admin resolved dispute in vendor favor (funds released to vendor)',
  },
  // 12. DISPUTED -> REFUNDED: Admin decides in client favor (100% refund)
  {
    from: OrderStatus.DISPUTED,
    to: OrderStatus.REFUNDED,
    allowedRoles: [Role.ADMIN],
    description: 'Admin resolved dispute in client favor (funds refunded to client)',
  },
  // 13. DISPUTED -> COMPLETED_WITH_PARTIAL_REFUND: Admin splits resolution
  {
    from: OrderStatus.DISPUTED,
    to: OrderStatus.COMPLETED_WITH_PARTIAL_REFUND,
    allowedRoles: [Role.ADMIN],
    description: 'Admin resolved dispute with partial payout to vendor and partial refund to client',
  },
  // 14. DISPUTED -> CANCELLED: Admin voids order entirely
  {
    from: OrderStatus.DISPUTED,
    to: OrderStatus.CANCELLED,
    allowedRoles: [Role.ADMIN],
    description: 'Admin cancelled order during dispute review',
  },
];

/**
 * Normalizes input status strings (handles lowercase and aliases like in_progress -> active)
 */
export function normalizeOrderStatus(status: string): OrderStatus {
  const upper = status.trim().toUpperCase();
  if (upper === 'IN_PROGRESS') return OrderStatus.ACTIVE;
  if (Object.values(OrderStatus).includes(upper as OrderStatus)) {
    return upper as OrderStatus;
  }
  throw new BadRequestException(`Unrecognized order status: "${status}"`);
}

/**
 * Checks whether a given transition is permitted for an actor role.
 */
export function canTransitionOrder(
  currentStatus: OrderStatus,
  targetStatus: OrderStatus,
  role: ActorRole,
): { allowed: boolean; reason?: string } {
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  // Find matching rule
  const rule = ORDER_STATE_MACHINE_TABLE.find(
    (r) => r.from === currentStatus && r.to === targetStatus,
  );

  if (!rule) {
    return {
      allowed: false,
      reason: `Illegal state transition from "${currentStatus}" to "${targetStatus}".`,
    };
  }

  if (!rule.allowedRoles.includes(role)) {
    return {
      allowed: false,
      reason: `Role "${role}" is not authorized to transition order from "${currentStatus}" to "${targetStatus}". Allowed: [${rule.allowedRoles.join(', ')}].`,
    };
  }

  return { allowed: true };
}

/**
 * Enforces transition rule. Throws exception if not permitted.
 */
export function validateOrderTransition(
  currentStatus: OrderStatus,
  targetStatus: OrderStatus,
  role: ActorRole,
): void {
  const result = canTransitionOrder(currentStatus, targetStatus, role);
  if (!result.allowed) {
    if (result.reason?.includes('not authorized')) {
      throw new ForbiddenException(result.reason);
    }
    throw new BadRequestException(result.reason);
  }
}

/**
 * Returns all valid next statuses that the given role can initiate
 */
export function getAvailableTransitions(
  currentStatus: OrderStatus,
  role: ActorRole,
): StateTransitionRule[] {
  return ORDER_STATE_MACHINE_TABLE.filter(
    (rule) => rule.from === currentStatus && rule.allowedRoles.includes(role),
  );
}
