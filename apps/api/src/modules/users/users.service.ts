import { UnauthorizedError } from '../../shared/errors/index.js';
import type { UsersRepository } from './users.repository.js';
import type { UserRecord } from './users.types.js';

export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  /** Usuário autenticado. O id vem SEMPRE do token, nunca do cliente. */
  async getMe(userId: string): Promise<UserRecord> {
    const user = await this.users.findById(userId);
    // Token válido de um usuário que não existe mais: tratar como sessão inválida.
    if (!user) throw new UnauthorizedError('Sessão inválida. Faça login novamente.');
    return user;
  }
}
