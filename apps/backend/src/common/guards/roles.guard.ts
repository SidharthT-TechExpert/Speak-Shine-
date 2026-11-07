import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, TrainerApprovalStatus } from '@speak-shine/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If route doesn't specify roles, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    // Role check
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Requires one of roles: [${requiredRoles.join(', ')}]`,
      );
    }

    // Special check: If user is TRAINER, ensure their approvalStatus is ACTIVE
    if (user.role === Role.TRAINER) {
      if (user.trainerApprovalStatus && user.trainerApprovalStatus !== TrainerApprovalStatus.ACTIVE) {
        throw new ForbiddenException(
          'Trainer account is awaiting administrative approval or suspended',
        );
      }
    }

    return true;
  }
}
