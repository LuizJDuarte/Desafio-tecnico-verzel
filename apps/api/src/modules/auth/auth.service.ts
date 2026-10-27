import { HttpStatus, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { UserDto, UserRole } from '@arremate/shared';
import { Clock } from '../../common/clock';
import { AppException, notFound } from '../../common/errors';
import { TransactionRunner } from '../../common/transaction-runner';
import { UserEntity, WalletEntity } from '../../database/entities';

const BCRYPT_COST = 10;
/** Hash real de uma senha descartável: login com e-mail inexistente gasta o mesmo tempo que com e-mail válido. */
const TIMING_SAFE_DUMMY_HASH = bcrypt.hashSync('arremate-dummy-password', BCRYPT_COST);

export function toUserDto(user: UserEntity): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async register(input: { name: string; email: string; password: string; role: UserRole }): Promise<UserEntity> {
    const users = this.dataSource.getRepository(UserEntity);
    if (await users.exists({ where: { email: input.email } })) {
      throw new AppException(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Este e-mail já está cadastrado.');
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const now = this.clock.now();
    const user: UserEntity = Object.assign(new UserEntity(), {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      createdAt: now,
    });

    try {
      await this.tx.run(async (manager) => {
        await manager.insert(UserEntity, user);
        // Todo usuário tem carteira (o leiloeiro recebe os créditos das vendas nela).
        await manager.insert(WalletEntity, { userId: user.id, balanceCents: 0, heldCents: 0, updatedAt: now });
      }, 'cadastro');
    } catch (error) {
      if ((error as { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new AppException(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Este e-mail já está cadastrado.');
      }
      throw error;
    }
    return user;
  }

  async login(email: string, password: string): Promise<UserEntity> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
    // Mesmo caminho de comparação quando o e-mail não existe, para não revelar quais e-mails têm conta.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? TIMING_SAFE_DUMMY_HASH);
    if (!user || !ok) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
    }
    return user;
  }

  async getById(id: string): Promise<UserEntity> {
    const user = await this.findById(id);
    if (!user) throw notFound('Usuário');
    return user;
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.dataSource.getRepository(UserEntity).findOneBy({ id });
  }
}
